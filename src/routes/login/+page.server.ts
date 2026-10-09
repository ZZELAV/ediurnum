import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { registerFailure, registerSuccess, throttleRemaining, unlockWithPassword } from '$lib/server/vault';
import { clientKey, startSession } from '$lib/server/auth';

export const actions: Actions = {
	default: async (event) => {
		const key = `login:${clientKey(event)}`;
		const wait = throttleRemaining(key);
		if (wait > 0) return fail(429, { error: 'error.throttled', seconds: wait });

		const form = await event.request.formData();
		const dek = await unlockWithPassword(String(form.get('password') ?? ''));
		if (!dek) {
			registerFailure(key);
			return fail(400, { error: 'error.wrongPassword' });
		}
		registerSuccess(key);
		startSession(event.cookies, dek);
		redirect(303, '/');
	}
};
