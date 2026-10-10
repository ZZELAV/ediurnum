import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { addDays, isIsoDate, todayIso } from '#lib/dates.ts';
import { getEntry, listEntryMeta } from '#lib/server/entries.ts';
import { suggestionsFor } from '#lib/reminders.ts';
import { loadReminders } from '#lib/server/reminders.ts';

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
