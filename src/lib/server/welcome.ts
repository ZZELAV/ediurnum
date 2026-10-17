import { getMeta } from './db.ts';
import { hasPin } from './vault.ts';
import { hasProfile } from './profile.ts';
import { listDevices } from './reminders.ts';
import type { EntryMeta } from '#lib/types.ts';

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
