import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadProfile, saveProfile } from '$lib/server/profile';
import { log } from '$lib/server/log';

export const load: PageServerLoad = ({ locals, url }) => {
	return {
		profile: loadProfile(locals.session!.dek),
		welcome: url.searchParams.has('welcome')
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		let input: unknown;
		try {
			input = JSON.parse(String(form.get('profile') ?? '{}'));
		} catch {
			return fail(400, { error: 'common.error' });
		}
		saveProfile(locals.session!.dek, input);
		log.info('self-assessment saved');
		return { success: 'profile.saved' };
	}
};
