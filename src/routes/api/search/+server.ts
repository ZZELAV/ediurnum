import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { readJson } from '#lib/server/api.ts';
import { translate } from '#lib/i18n/index.ts';
import { matchEntry, searchTerms, type SearchHit } from '#lib/search.ts';
import { getEntry, listEntryMeta } from '#lib/server/entries.ts';

/**
 * Full-text search. POST on purpose: the search term belongs to the journal content and must
 * not appear in the address (browser history, logs of the reverse proxy).
 */
export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const lang = event.locals.settings?.language ?? 'de';
	const { query } = await readJson(event.request);
	const terms = searchTerms(String(query ?? '').slice(0, 200));

	const results: ({ date: string; mood: number | null; locked: boolean } & SearchHit)[] = [];
	let skippedLocked = 0;
	if (terms.length) {
		for (const m of listEntryMeta()) {
			if (m.locked && !session.lockKey) {
				skippedLocked++;
				continue;
			}
			const content = getEntry(session, m.date)?.content;
			const hit = content && matchEntry(content, terms, (k) => translate(lang, k));
			if (hit) results.push({ date: m.date, mood: content.mood, locked: m.locked, ...hit });
		}
	}
	return Response.json({ results, skippedLocked });
};
