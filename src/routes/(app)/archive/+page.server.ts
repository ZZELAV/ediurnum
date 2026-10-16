import type { PageServerLoad } from './$types';
import { addMonths, monthKey, todayIso } from '#lib/dates.ts';
import { getEntry, listEntryMeta } from '#lib/server/entries.ts';
import { snippetOf } from '#lib/server/snippet.ts';

/** `readable`: Inhalt lesbar (nicht gesperrt oder PIN offen) – sonst fehlen Stimmung, Gefühle und Auszug. */
type Day = { date: string; mood: number | null; locked: boolean; readable: boolean; kinds: string[]; emotions: string[]; snippet: string };

/** Alle Monate vom laufenden zurück bis `oldest` (beide eingeschlossen), neuester zuerst. */
function monthsBack(current: string, oldest: string): string[] {
	const out: string[] = [];
	for (let key = current; key >= oldest; key = addMonths(key, -1)) out.push(key);
	return out;
}

export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	const byMonth = new Map<string, Day[]>();
	const metas = listEntryMeta(); // neuester Tag zuerst
	for (const m of metas) {
		const e = m.locked && !session.lockKey ? null : getEntry(session, m.date);
		const emotions = e?.content?.sections.gefuehl?.emotions;
		const key = monthKey(m.date);
		if (!byMonth.has(key)) byMonth.set(key, []);
		byMonth.get(key)!.push({
			date: m.date,
			mood: e?.content?.mood ?? null,
			locked: m.locked,
			readable: !!e?.content,
			kinds: m.kinds,
			// für den Filter (Gefühle aus dem Wochenrückblick)
			emotions: Array.isArray(emotions) ? emotions : [],
			snippet: e?.content ? snippetOf(e.content, 90) : ''
		});
	}
	if (!metas.length) return { months: [] };
	// Lückenlos vom laufenden Monat bis zum Monat des ersten Eintrags – auch Monate ohne Eintrag,
	// damit sich jeder Tag im Kalender nachtragen lässt
	const oldest = monthKey(metas[metas.length - 1].date);
	const current = monthKey(todayIso());
	const keys = monthsBack(current > oldest ? current : oldest, oldest);
	return { months: keys.map((month) => ({ month, days: byMonth.get(month) ?? [] })) };
};
