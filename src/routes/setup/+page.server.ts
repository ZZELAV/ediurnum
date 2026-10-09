import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { generateKey, parseRecoveryKey } from '$lib/server/crypto';
import { initialize, isInitialized } from '$lib/server/vault';
import { defaultSettings, saveSettings } from '$lib/server/settings';
import { readBackup, restoreBackup } from '$lib/server/backup';
import { startSession } from '$lib/server/auth';
import { saveReminders } from '$lib/server/reminders';
import { defaultReminders } from '$lib/reminders';
import { validateNewPassword } from '$lib/server/validation';
import { log } from '$lib/server/log';

export const load: PageServerLoad = ({ locals }) => {
	if (isInitialized()) redirect(303, locals.session ? '/' : '/login');
	return {};
};

export const actions: Actions = {
	create: async ({ request, cookies, locals }) => {
		if (isInitialized()) return fail(400, { error: 'error.alreadyInitialized' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim().slice(0, 60);
		const password = String(form.get('password') ?? '');
		if (!name) return fail(400, { error: 'error.nameMissing', name });
		const err = validateNewPassword(password, String(form.get('confirm') ?? ''));
		if (err) return fail(400, { error: err, name });

		const dek = generateKey();
		const recoveryKey = await initialize(password, dek);
		saveSettings(dek, { ...defaultSettings(), name, language: locals.lang });
		saveReminders(defaultReminders(locals.lang));
		startSession(cookies, dek);
		log.info('journal created');
		return { recoveryKey };
	},

	restore: async ({ request, cookies }) => {
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
		await initialize(password, dek);
		restoreBackup(data);
		startSession(cookies, dek);
		log.info('journal restored from backup', { entries: data.entries.length });
		redirect(303, '/');
	}
};
