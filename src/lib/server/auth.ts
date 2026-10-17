import { error, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/env';
import { COOKIE_SECURE, ORIGIN } from '$app/env/private';
import { createSession, destroySession, type Session } from './vault.ts';
import { loadSettings, saveSettings } from './settings.ts';
import { setReminderLang } from './reminders.ts';
import { resolveLocale } from '#lib/i18n/index.ts';
import type { Settings } from '#lib/types.ts';

export const SESSION_COOKIE = 'ediurnum_session';
/** Time zone of the device (set by the browser, see +layout.svelte) – only to find the country for the locale */
export const TZ_COOKIE = 'tz';

/** Locale for the language and the region of the settings (with "auto": the country of the device sending the request). */
export function settingsLocale(event: RequestEvent, settings: Pick<Settings, 'language' | 'region'>) {
	return resolveLocale(settings.language, settings.region, event.request.headers.get('accept-language'), event.cookies.get(TZ_COOKIE));
}

function secureCookies(): boolean {
	if (COOKIE_SECURE) return COOKIE_SECURE !== 'false';
	return !dev && (ORIGIN ?? '').startsWith('https://');
}

export function startSession(event: RequestEvent, dek: Buffer): Session {
	const { cookies } = event;
	const settings = loadSettings(dek);
	// remember the locale of this device – push messages and the converter script have no device to ask
	const loc = settingsLocale(event, settings).locale;
	if (settings.locale !== loc) {
		settings.locale = loc;
		saveSettings(dek, settings);
		setReminderLang(loc);
	}
	const session = createSession(dek, settings.leaveMinutes);
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

/** Language, region and theme as cookies, so that pages without a session (login, recover) look like the app. */
export function setDisplayCookies(cookies: Cookies, settings: Settings) {
	const options = { path: '/', httpOnly: false, sameSite: 'strict', secure: secureCookies(), maxAge: 60 * 60 * 24 * 365 } as const;
	cookies.set('lang', settings.language, options);
	cookies.set('region', settings.region, options);
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
