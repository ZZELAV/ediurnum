import { decryptJson, encryptJson } from './crypto';
import { getMeta, setMeta } from './db';
import type { AiAgent, PublicAiAgent, Settings } from '$lib/types';

const AAD = 'ediurnum/settings';

export function defaultSettings(): Settings {
	return {
		name: '',
		language: 'de',
		theme: 'system',
		sessionMinutes: 30,
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
	// Unbekannte Erscheinungsbilder (z. B. ein entferntes) folgen wieder dem System
	if (settings.theme !== 'light' && settings.theme !== 'dark') settings.theme = 'system';
	return settings;
}

export function saveSettings(dek: Buffer, settings: Settings) {
	setMeta('settings', encryptJson(dek, settings, AAD).toString('base64'));
}

export function publicAgent(a: AiAgent): PublicAiAgent {
	const { apiKey, ...rest } = a;
	return { ...rest, hasApiKey: apiKey.length > 0 };
}
