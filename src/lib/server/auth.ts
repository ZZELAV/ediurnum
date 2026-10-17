import { error, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import { COOKIE_SECURE, ORIGIN } from '$app/env/private';
import { createSession, destroySession, type Session } from './vault.ts';
import { loadSettings } from './settings.ts';
import type { Settings } from '#lib/types.ts';

export const SESSION_COOKIE = 'ediurnum_session';

function secureCookies(): boolean {
	if (COOKIE_SECURE) return COOKIE_SECURE !== 'false';
	return !dev && (ORIGIN ?? '').startsWith('https://');
}

export function startSession(cookies: Cookies, dek: Buffer): Session {
	const settings = loadSettings(dek);
	const session = createSession(dek, settings.sessionMinutes, settings.leaveMinutes);
	cookies.set(SESSION_COOKIE, session.token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: secureCookies()
	});
	setDisplayCookies(cookies, settings);
	return session;
}

export function endSession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) destroySession(token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Language and theme as cookies, so that pages without a session (login, recover) look like the app. */
export function setDisplayCookies(cookies: Cookies, settings: Settings) {
	const options = { path: '/', httpOnly: false, sameSite: 'strict', secure: secureCookies(), maxAge: 60 * 60 * 24 * 365 } as const;
	cookies.set('lang', settings.language, options);
	cookies.set('theme', settings.theme, options);
}

/** For API routes: returns the session or aborts with 401. */
export function requireSession(event: RequestEvent): Session {
	const s = event.locals.session;
	if (!s) error(401, 'unauthorized');
	return s;
}

export function clientKey(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}
