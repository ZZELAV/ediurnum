import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { ORIGIN } from '$app/env/private';
import { startReminderScheduler } from '#lib/server/reminders.ts';
import { getSession, isInitialized } from '#lib/server/vault.ts';
import { isTheme, loadSettings } from '#lib/server/settings.ts';
import { dataDir } from '#lib/server/db.ts';
import { log } from '#lib/server/log.ts';
import { isLang, isRegion, pickLang } from '#lib/i18n/index.ts';
import { SESSION_COOKIE, settingsLocale } from '#lib/server/auth.ts';

const PUBLIC_PATHS = ['/setup', '/login', '/recover'];
/** Check a token themselves instead of the session (e.g. dashboard widget). */
const TOKEN_PATHS = ['/api/widget'];

/** Older devices ask for icon names of their own (e.g. "-precomposed" or with a size). */
const TOUCH_ICON_ALIAS = /^\/apple-touch-icon(-\d+x\d+)?(-precomposed)?\.png$/;

/** On server start: write details to the log and start the scheduler for reminders (push). */
export const init: ServerInit = () => {
	log.info('ediurnum started', {
		version: __APP_VERSION__,
		node: process.version,
		origin: ORIGIN ?? '(not set)',
		dataDir: dataDir(),
		tz: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
		initialized: isInitialized()
	});
	if (!ORIGIN && !dev) log.warn('ORIGIN is not set – session cookies are not marked secure and push notifications use a placeholder sender');
	startReminderScheduler();
};

export const handle: Handle = async ({ event, resolve }) => {
	const started = Date.now();
	const path = event.url.pathname;

	if (TOUCH_ICON_ALIAS.test(path)) redirect(301, '/apple-touch-icon.png');

	const session = getSession(event.cookies.get(SESSION_COOKIE));
	event.locals.session = session;
	event.locals.settings = session ? loadSettings(session.dek) : null;

	const cookieLang = event.cookies.get('lang');
	event.locals.lang =
		event.locals.settings?.language ?? (isLang(cookieLang) ? cookieLang : pickLang(event.request.headers.get('accept-language')));
	// locale = language of the app + region of the settings or country of the device, e.g. de-CH
	const cookieRegion = event.cookies.get('region');
	const region = event.locals.settings?.region ?? (isRegion(event.locals.lang, cookieRegion) ? cookieRegion : null);
	({ locale: event.locals.locale, deviceCountry: event.locals.deviceCountry } = settingsLocale(event, { language: event.locals.lang, region: region ?? 'auto' }));
	const cookieTheme = event.cookies.get('theme');
	event.locals.theme = event.locals.settings?.theme ?? (isTheme(cookieTheme) ? cookieTheme : 'system');

	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	const isApi = path.startsWith('/api/');

	if (!isInitialized()) {
		if (path !== '/setup') {
			if (isApi) return Response.json({ error: 'error.unauthorized' }, { status: 401 });
			redirect(303, '/setup');
		}
	} else if (TOKEN_PATHS.includes(path)) {
		// access via token, see the endpoint
	} else if (!session && !isPublic) {
		if (isApi) return Response.json({ error: 'error.unauthorized' }, { status: 401 });
		redirect(303, '/login');
	} else if (session && isPublic && path !== '/setup') {
		redirect(303, '/');
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale).replace('%theme%', event.locals.theme)
	});

	response.headers.set('X-Content-Type-Options', 'nosniff');
	// "same-origin" instead of "no-referrer": with "no-referrer" browsers send "Origin: null" for normal forms
	// – SvelteKit rejects such POST requests as cross-site (e.g. when locking).
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
	if (!response.headers.has('Cache-Control') && !path.startsWith('/_app/')) {
		response.headers.set('Cache-Control', 'no-store');
	}
	if (log.isDebug()) log.debug(`${event.request.method} ${path}`, { status: response.status, ms: Date.now() - started });
	return response;
};

/**
 * Writes errors to the log (without request contents). Expected errors (own `error()` calls such as 401/404,
 * 404 from SvelteKit) only in debug mode, other errors from SvelteKit (e.g. 403 for a foreign origin)
 * as a warning, unexpected ones as an error with a stack trace. The response to the browser stays unchanged.
 */
export const handleError: HandleServerError = (caught) => {
	const where = { method: caught.event.request.method, path: caught.event.url.pathname };
	if (caught.kind === 'unknown') {
		const e = caught.error;
		log.error('request failed', { ...where, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
	} else if (caught.kind === 'app' || caught.error.status === 404) {
		log.debug('request rejected', { ...where, status: caught.error.status });
	} else {
		log.warn('request rejected', { ...where, status: caught.error.status, reason: caught.error.message });
	}
};
