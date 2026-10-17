import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { registerFailure, registerSuccess, throttleRemaining, unlockWithPassword } from '#lib/server/vault.ts';
import { clientKey, startSession } from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';

export const actions: Actions = {
	default: async (event) => {
		const ip = clientKey(event);
		const key = `login:${ip}`;
		const wait = throttleRemaining(key);
		if (wait > 0) return fail(429, { error: 'error.throttled', seconds: wait });

		const form = await event.request.formData();
		const dek = await unlockWithPassword(String(form.get('password') ?? ''));
		if (!dek) {
			registerFailure(key);
			return fail(400, { error: 'error.wrongPassword' });
		}
		registerSuccess(key);
		startSession(event, dek);
		log.info('journal opened', { ip });
		redirect(303, '/');
	}
};
