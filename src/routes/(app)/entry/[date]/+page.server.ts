import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { addDays, isIsoDate, todayIso } from '$lib/dates';
import { getEntry, listEntryMeta } from '$lib/server/entries';
import { suggestionsFor } from '$lib/reminders';
import { loadReminders } from '$lib/server/reminders';

export const load: PageServerLoad = ({ params, locals }) => {
	const today = todayIso();
	if (!isIsoDate(params.date) || params.date > today) redirect(303, `/entry/${today}`);
	const date = params.date;
	const metas = listEntryMeta();
	const entry = getEntry(locals.session!, date);
	return {
		date,
		entry,
		suggestions: suggestionsFor(date, metas, loadReminders()),
		prev: addDays(date, -1),
		next: date < today ? addDays(date, 1) : null
	};
};
