import { json, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { startReminderScheduler } from '$lib/server/reminders';
import { getSession, isInitialized } from '$lib/server/vault';
import { loadSettings } from '$lib/server/settings';
import { isLang, pickLang } from '$lib/i18n';
import { SESSION_COOKIE } from '$lib/server/auth';

const PUBLIC_PATHS = ['/setup', '/login', '/recover'];

/** Beim Serverstart: Planer für Erinnerungen (Push) starten. */
export const init: ServerInit = () => {
	startReminderScheduler();
};

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
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
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
	if (!response.headers.has('Cache-Control') && !path.startsWith('/_app/')) {
		response.headers.set('Cache-Control', 'no-store');
	}
	return response;
};
