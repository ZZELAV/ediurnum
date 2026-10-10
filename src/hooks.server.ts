import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { ORIGIN } from '$app/env/private';
import { startReminderScheduler } from '#lib/server/reminders.ts';
import { getSession, isInitialized } from '#lib/server/vault.ts';
import { loadSettings } from '#lib/server/settings.ts';
import { dataDir } from '#lib/server/db.ts';
import { log } from '#lib/server/log.ts';
import { isLang, pickLang, pickLocale } from '#lib/i18n/index.ts';
import { SESSION_COOKIE } from '#lib/server/auth.ts';

const PUBLIC_PATHS = ['/setup', '/login', '/recover'];
/** Prüfen selbst einen Token statt der Sitzung (z. B. Dashboard-Widget). */
const TOKEN_PATHS = ['/api/widget'];

/** Ältere Geräte fragen eigene Namen für das Symbol ab (z. B. „-precomposed“ oder mit Grösse). */
const TOUCH_ICON_ALIAS = /^\/apple-touch-icon(-\d+x\d+)?(-precomposed)?\.png$/;

/** Beim Serverstart: Angaben ins Log schreiben und den Planer für Erinnerungen (Push) starten. */
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
	event.locals.locale = pickLocale(event.request.headers.get('accept-language'), event.locals.lang);

	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	const isApi = path.startsWith('/api/');

	if (!isInitialized()) {
		if (path !== '/setup') {
			if (isApi) return Response.json({ error: 'error.unauthorized' }, { status: 401 });
			redirect(303, '/setup');
		}
	} else if (TOKEN_PATHS.includes(path)) {
		// Zugang über Token, siehe Endpunkt
	} else if (!session && !isPublic) {
		if (isApi) return Response.json({ error: 'error.unauthorized' }, { status: 401 });
		redirect(303, '/login');
	} else if (session && isPublic && path !== '/setup') {
		redirect(303, '/');
	}

	const theme = event.locals.settings?.theme ?? 'system';
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.lang).replace('%theme%', theme)
	});

	response.headers.set('X-Content-Type-Options', 'nosniff');
	// "same-origin" statt "no-referrer": Bei "no-referrer" senden Browser bei normalen Formularen
	// "Origin: null" – SvelteKit lehnt solche POST-Anfragen als Cross-Site ab (z. B. beim Schliessen).
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
 * Fehler ins Log schreiben (ohne Anfrageinhalte). Erwartete Fehler (eigene `error()`-Aufrufe wie 401/404,
 * 404 von SvelteKit) nur im Debug-Modus, andere Fehler von SvelteKit (z. B. 403 bei fremder Herkunft)
 * als Warnung, unerwartete als Fehler mit Stacktrace. Die Antwort an den Browser bleibt unverändert.
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
