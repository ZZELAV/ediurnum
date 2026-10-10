import type { PageServerLoad } from './$types';
import { monthKey } from '#lib/dates.ts';
import { getEntry, listEntryMeta } from '#lib/server/entries.ts';
import { snippetOf } from '#lib/server/snippet.ts';

export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	const months = new Map<string, { date: string; mood: number | null; locked: boolean; kinds: string[]; snippet: string }[]>();
	for (const m of listEntryMeta()) {
		const e = m.locked && !session.lockKey ? null : getEntry(session, m.date);
		const key = monthKey(m.date);
		if (!months.has(key)) months.set(key, []);
		months.get(key)!.push({
			date: m.date,
			mood: e?.content?.mood ?? null,
			locked: m.locked,
			kinds: m.kinds,
			snippet: e?.content ? snippetOf(e.content, 90) : ''
		});
	}
	return { months: [...months.entries()].map(([month, days]) => ({ month, days })) };
};
