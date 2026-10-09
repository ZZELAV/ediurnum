import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { endSession } from '$lib/server/auth';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		endSession(cookies);
		redirect(303, '/login');
	}
};
