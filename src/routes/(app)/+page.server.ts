import type { PageServerLoad } from './$types';
import { addYears, todayIso } from '$lib/dates';
import { getEntry, listEntryMeta, moodSeries } from '$lib/server/entries';
import { pinnedAnalysis } from '$lib/server/analyses';
import { suggestionsFor } from '$lib/reminders';
import { loadReminders } from '$lib/server/reminders';
import { snippetOf } from '$lib/server/snippet';
import type { EntryMeta } from '$lib/types';

export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	const today = todayIso();
	const metas = listEntryMeta();
	const byDate = new Map(metas.map((m) => [m.date, m]));
	const preview = (m: EntryMeta, max = 140) => {
		const e = m.locked && !session.lockKey ? null : getEntry(session, m.date);
		return { ...m, mood: e?.content?.mood ?? null, snippet: e?.content ? snippetOf(e.content, max) : '' };
	};

	// „Heute vor einem Jahr“ (und weiter zurück, solange es Einträge gibt)
	const oldest = metas.at(-1)?.date;
	const onThisDay = [];
	for (let years = 1; oldest && addYears(today, -years) >= oldest; years++) {
		const m = byDate.get(addYears(today, -years));
		if (m) onThisDay.push({ ...preview(m, 220), years });
	}

	// Stimmungsverlauf zum Fokus: vom Beginn des ausgewerteten Zeitraums bis heute
	const pinned = pinnedAnalysis(session.dek);
	const focusMood = pinned ? { from: pinned.from, to: today, points: moodSeries(session, pinned.from, today) } : null;

	return {
		focusMood,
		todayMeta: byDate.get(today) ?? null,
		suggestions: suggestionsFor(today, metas, loadReminders()),
		onThisDay,
		recent: metas
			.filter((m) => m.date !== today)
			.slice(0, 6)
			.map((m) => preview(m)),
		total: metas.length,
		hour: new Date().getHours()
	};
};
