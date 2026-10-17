import { decryptJson, encryptJson, SETTINGS_AAD as AAD } from './crypto.ts';
import { getMeta, setMeta } from './db.ts';
import { AUTO_REGION, DEFAULT_LANG, isLocale, isRegion, langOf, locale } from '#lib/i18n/index.ts';
import type { AiAgent, PublicAiAgent, Settings, Theme } from '#lib/types.ts';

export function isTheme(value: unknown): value is Theme {
	return value === 'system' || value === 'light' || value === 'dark';
}

export function defaultSettings(): Settings {
	return {
		name: '',
		language: DEFAULT_LANG,
		region: AUTO_REGION,
		locale: locale(DEFAULT_LANG),
		theme: 'system',
		leaveMinutes: 1,
		focusMode: false,
		welcomeHidden: false,
		aiInstructions: '',
		agents: [],
		defaultAgentId: null
	};
}

export function loadSettings(dek: Buffer): Settings {
	const raw = getMeta('settings');
	if (!raw) return defaultSettings();
	const settings = { ...defaultSettings(), ...decryptJson<Partial<Settings>>(dek, Buffer.from(raw, 'base64'), AAD) };
	// removed in 1.1.0: locking after inactivity
	delete (settings as Partial<Settings> & { sessionMinutes?: number }).sessionMinutes;
	// unknown themes (e.g. a removed one) follow the system again
	if (!isTheme(settings.theme)) settings.theme = 'system';
	if (!isRegion(settings.language, settings.region)) settings.region = AUTO_REGION;
	// settings from before 1.1.0 have no locale yet; it is set at the next login
	if (!isLocale(settings.locale) || langOf(settings.locale) !== settings.language) settings.locale = locale(settings.language);
	return settings;
}

export function saveSettings(dek: Buffer, settings: Settings) {
	setMeta('settings', encryptJson(dek, settings, AAD).toString('base64'));
}

export function publicAgent(a: AiAgent): PublicAiAgent {
	const { apiKey, ...rest } = a;
	return { ...rest, hasApiKey: apiKey.length > 0 };
}
