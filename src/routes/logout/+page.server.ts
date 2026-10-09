import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { endSession } from '$lib/server/auth';
import { log } from '$lib/server/log';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		endSession(cookies);
		log.info('journal closed');
		redirect(303, '/login');
	}
};
