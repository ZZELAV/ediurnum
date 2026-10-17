import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { generateKey, parseRecoveryKey } from '#lib/server/crypto.ts';
import { initialize, isInitialized } from '#lib/server/vault.ts';
import { defaultSettings, saveSettings } from '#lib/server/settings.ts';
import { restoreBackup } from '#lib/server/backup.ts';
import { readBackup } from '#lib/server/backup-file.ts';
import { startSession } from '#lib/server/auth.ts';
import { saveReminders } from '#lib/server/reminders.ts';
import { defaultReminders } from '#lib/reminders.ts';
import { validateNewPassword } from '#lib/server/validation.ts';
import { log } from '#lib/server/log.ts';
import { nowIso, setMeta } from '#lib/server/db.ts';

export const load: PageServerLoad = ({ locals }) => {
	if (isInitialized()) redirect(303, locals.session ? '/' : '/login');
	return {};
};

/** Like initialize(), but null instead of an error if a simultaneous setup came first. */
async function tryInitialize(password: string, dek: Buffer): Promise<string | null> {
	try {
		return await initialize(password, dek);
	} catch (e) {
		if ((e as Error).message === 'already-initialized') return null;
		throw e;
	}
}

export const actions: Actions = {
	create: async (event) => {
		const { request, locals } = event;
		if (isInitialized()) return fail(400, { error: 'error.alreadyInitialized' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim().slice(0, 60);
		const password = String(form.get('password') ?? '');
		if (!name) return fail(400, { error: 'error.nameMissing', name });
		const err = validateNewPassword(password, String(form.get('confirm') ?? ''));
		if (err) return fail(400, { error: err, name });

		const dek = generateKey();
		const recoveryKey = await tryInitialize(password, dek);
		if (!recoveryKey) return fail(400, { error: 'error.alreadyInitialized' });
		saveSettings(dek, { ...defaultSettings(), name, language: locals.lang });
		saveReminders(defaultReminders(locals.locale));
		startSession(event, dek);
		log.info('journal created');
		return { recoveryKey };
	},

	restore: async (event) => {
		const { request } = event;
		if (isInitialized()) return fail(400, { error: 'error.alreadyInitialized', mode: 'restore' });
		const form = await request.formData();
		const file = form.get('backup');
		const password = String(form.get('password') ?? '');
		const err = validateNewPassword(password, String(form.get('confirm') ?? ''));
		if (err) return fail(400, { error: err, mode: 'restore' });
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'backup.missingFile', mode: 'restore' });

		let dek: Buffer;
		try {
			dek = parseRecoveryKey(String(form.get('recoveryKey') ?? ''));
		} catch (e) {
			return fail(400, { error: (e as Error).message, mode: 'restore' });
		}
		let data;
		try {
			data = readBackup(await file.text(), dek);
		} catch (e) {
			log.warn('backup restore failed', { reason: (e as Error).message });
			return fail(400, { error: (e as Error).message, mode: 'restore' });
		}
		if (!(await tryInitialize(password, dek))) return fail(400, { error: 'error.alreadyInitialized', mode: 'restore' });
		restoreBackup(data);
		setMeta('backup_last', nowIso()); // restoring from a backup means having one (welcome card)
		startSession(event, dek);
		log.info('journal restored from backup', { entries: data.entries.length });
		redirect(303, '/');
	}
};
