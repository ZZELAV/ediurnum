import type { PageServerLoad } from './$types';
import { monthKey } from '$lib/dates';
import { translate } from '$lib/i18n';
import { matchEntry, searchTerms, type SearchHit } from '$lib/search';
import { getEntry, listEntryMeta } from '$lib/server/entries';
import { snippetOf } from '$lib/server/snippet';

export const load: PageServerLoad = ({ locals, url }) => {
	const session = locals.session!;
	const lang = locals.settings?.language ?? 'de';
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const terms = searchTerms(query);

	const months = new Map<string, { date: string; mood: number | null; locked: boolean; kinds: string[]; snippet: string }[]>();
	const results: ({ date: string; mood: number | null; locked: boolean } & SearchHit)[] = [];
	let skippedLocked = 0;

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
		if (!terms.length) continue;
		if (!e?.content) {
			if (m.locked) skippedLocked++;
			continue;
		}
		const hit = matchEntry(e.content, terms, (k) => translate(lang, k));
		if (hit) results.push({ date: m.date, mood: e.content.mood, locked: m.locked, ...hit });
	}

	return {
		months: [...months.entries()].map(([month, days]) => ({ month, days })),
		search: terms.length ? { query, results, skippedLocked } : null
	};
};
