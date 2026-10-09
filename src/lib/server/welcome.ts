import { getMeta } from './db';
import { hasPin } from './vault';
import { hasProfile } from './profile';
import { listDevices } from './reminders';
import type { EntryMeta } from '$lib/types';

/**
 * Willkommenskarte: die ersten Schritte in ediurnum. Jeder Schritt hakt sich automatisch ab,
 * sobald er erledigt ist – es werden nur vorhandene Metadaten geprüft, keine Inhalte.
 */
export const WELCOME_STEPS = ['entry', 'profile', 'reminders', 'pin', 'backup'] as const;
export type WelcomeStep = (typeof WELCOME_STEPS)[number];

export function welcomeProgress(metas: EntryMeta[]): Record<WelcomeStep, boolean> {
	return {
		entry: metas.length > 0,
		profile: hasProfile(),
		reminders: listDevices().length > 0,
		pin: hasPin(),
		backup: getMeta('backup_last') !== null
	};
}
