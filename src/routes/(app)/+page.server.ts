import type { PageServerLoad } from './$types';
import { todayIso } from '$lib/dates';
import { getEntry, listEntryMeta } from '$lib/server/entries';
import { suggestionsFor } from '$lib/reminders';
import { loadReminders } from '$lib/server/reminders';
import { snippetOf } from '$lib/server/snippet';

export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	const today = todayIso();
	const metas = listEntryMeta();
	const todayMeta = metas.find((m) => m.date === today) ?? null;
	const recent = metas
		.filter((m) => m.date !== today)
		.slice(0, 6)
		.map((m) => {
			const e = m.locked ? null : getEntry(session, m.date);
			return { ...m, mood: e?.content?.mood ?? null, snippet: e?.content ? snippetOf(e.content) : '' };
		});
	return {
		todayMeta,
		suggestions: suggestionsFor(today, metas, loadReminders()),
		recent,
		total: metas.length,
		hour: new Date().getHours()
	};
};
