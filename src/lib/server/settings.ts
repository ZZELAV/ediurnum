import { decryptJson, encryptJson, SETTINGS_AAD as AAD } from './crypto.ts';
import { getMeta, setMeta } from './db.ts';
import type { AiAgent, PublicAiAgent, Settings, Theme } from '#lib/types.ts';

export function isTheme(value: unknown): value is Theme {
	return value === 'system' || value === 'light' || value === 'dark';
}

export function defaultSettings(): Settings {
	return {
		name: '',
		language: 'de',
		theme: 'system',
		sessionMinutes: 30,
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
	// unknown themes (e.g. a removed one) follow the system again
	if (!isTheme(settings.theme)) settings.theme = 'system';
	return settings;
}

export function saveSettings(dek: Buffer, settings: Settings) {
	setMeta('settings', encryptJson(dek, settings, AAD).toString('base64'));
}

export function publicAgent(a: AiAgent): PublicAiAgent {
	const { apiKey, ...rest } = a;
	return { ...rest, hasApiKey: apiKey.length > 0 };
}
