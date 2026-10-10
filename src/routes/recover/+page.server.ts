import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { parseRecoveryKey } from '#lib/server/crypto.ts';
import {
	destroyAllSessions,
	matchesStoredKey,
	registerFailure,
	registerSuccess,
	setPassword,
	throttleRemaining
} from '#lib/server/vault.ts';
import { clientKey, startSession } from '#lib/server/auth.ts';
import { validateNewPassword } from '#lib/server/validation.ts';
import { log } from '#lib/server/log.ts';

export const actions: Actions = {
	default: async (event) => {
		const key = `recover:${clientKey(event)}`;
		const wait = throttleRemaining(key);
		if (wait > 0) return fail(429, { error: 'error.throttled', seconds: wait });

		const form = await event.request.formData();
		const password = String(form.get('password') ?? '');
		const err = validateNewPassword(password, String(form.get('confirm') ?? ''));
		if (err) return fail(400, { error: err });

		let dek: Buffer;
		try {
			dek = parseRecoveryKey(String(form.get('recoveryKey') ?? ''));
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		if (!matchesStoredKey(dek)) {
			registerFailure(key);
			return fail(400, { error: 'recovery.wrongKey' });
		}
		registerSuccess(key);
		await setPassword(dek, password);
		destroyAllSessions();
		log.info('password reset with recovery key');
		startSession(event.cookies, dek);
		redirect(303, '/');
	}
};
