import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isIsoDate } from '$lib/dates';
import { getEntry, listRevisions } from '$lib/server/entries';

export const load: PageServerLoad = ({ params, locals }) => {
	if (!isIsoDate(params.date)) redirect(303, '/');
	const entry = getEntry(locals.session!, params.date);
	if (!entry) redirect(303, `/entry/${params.date}`);
	return {
		date: params.date,
		locked: entry.locked,
		revisions: listRevisions(locals.session!, params.date)
	};
};
