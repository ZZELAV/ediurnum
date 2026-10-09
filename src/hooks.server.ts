import { json, redirect, type Handle, type HandleServerError, type ServerInit } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { startReminderScheduler } from '$lib/server/reminders';
import { getSession, isInitialized } from '$lib/server/vault';
import { loadSettings } from '$lib/server/settings';
import { dataDir } from '$lib/server/db';
import { log } from '$lib/server/log';
import { isLang, pickLang } from '$lib/i18n';
import { SESSION_COOKIE } from '$lib/server/auth';

const PUBLIC_PATHS = ['/setup', '/login', '/recover'];

/** Ältere Geräte fragen eigene Namen für das Symbol ab (z. B. „-precomposed“ oder mit Grösse). */
const TOUCH_ICON_ALIAS = /^\/apple-touch-icon(-\d+x\d+)?(-precomposed)?\.png$/;

/** Beim Serverstart: Angaben ins Log schreiben und den Planer für Erinnerungen (Push) starten. */
export const init: ServerInit = () => {
	log.info('ediurnum started', {
		version: __APP_VERSION__,
		node: process.version,
		origin: env.ORIGIN || '(not set)',
		dataDir: dataDir(),
		tz: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
		initialized: isInitialized()
	});
	if (!env.ORIGIN && !dev) log.warn('ORIGIN is not set – form submissions behind a reverse proxy will fail');
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

	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	const isApi = path.startsWith('/api/');

	if (!isInitialized()) {
		if (path !== '/setup') {
			if (isApi) return json({ error: 'error.unauthorized' }, { status: 401 });
			redirect(303, '/setup');
		}
	} else if (!session && !isPublic) {
		if (isApi) return json({ error: 'error.unauthorized' }, { status: 401 });
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

/** Unerwartete Fehler ins Log schreiben (ohne Anfrageinhalte); 404 nur im Debug-Modus. */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (status === 404) {
		log.debug('not found', { method: event.request.method, path: event.url.pathname });
	} else {
		log.error('request failed', {
			method: event.request.method,
			path: event.url.pathname,
			status,
			error: error instanceof Error ? (error.stack ?? error.message) : String(error)
		});
	}
	return { message };
};
