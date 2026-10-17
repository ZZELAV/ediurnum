import type { PageServerLoad } from './$types';
import { addMonths, monthKey, todayIso } from '#lib/dates.ts';
import { getEntry, listEntryMeta } from '#lib/server/entries.ts';
import { snippetOf } from '#lib/server/snippet.ts';

/** `readable`: content readable (not locked or PIN open) – otherwise mood, feelings and excerpt are missing. */
type Day = { date: string; mood: number | null; locked: boolean; readable: boolean; kinds: string[]; emotions: string[]; snippet: string };

/** All months from the current one back to `oldest` (both included), newest first. */
function monthsBack(current: string, oldest: string): string[] {
	const out: string[] = [];
	for (let key = current; key >= oldest; key = addMonths(key, -1)) out.push(key);
	return out;
}

export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	const byMonth = new Map<string, Day[]>();
	const metas = listEntryMeta(); // newest day first
	for (const m of metas) {
		const e = m.locked && !session.lockKey ? null : getEntry(session, m.date);
		const emotions = e?.content?.sections.feelings?.emotions;
		const key = monthKey(m.date);
		if (!byMonth.has(key)) byMonth.set(key, []);
		byMonth.get(key)!.push({
			date: m.date,
			mood: e?.content?.mood ?? null,
			locked: m.locked,
			readable: !!e?.content,
			kinds: m.kinds,
			// for the filter (feelings from the weekly review)
			emotions: Array.isArray(emotions) ? emotions : [],
			snippet: e?.content ? snippetOf(e.content, 90) : ''
		});
	}
	if (!metas.length) return { months: [] };
	// without gaps from the current month to the month of the first entry – also months without an entry,
	// so every day in the calendar can be filled in later
	const oldest = monthKey(metas[metas.length - 1].date);
	const current = monthKey(todayIso());
	const keys = monthsBack(current > oldest ? current : oldest, oldest);
	return { months: keys.map((month) => ({ month, days: byMonth.get(month) ?? [] })) };
};
