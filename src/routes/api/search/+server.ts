import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { translate } from '#lib/i18n/index.ts';
import { matchEntry, searchTerms, type SearchHit } from '#lib/search.ts';
import { getEntry, listEntryMeta } from '#lib/server/entries.ts';

/**
 * Volltextsuche. Bewusst per POST: Der Suchbegriff gehört zum Tagebuchinhalt und darf
 * nicht in der Adresse stehen (Browserverlauf, Protokolle des Reverse-Proxys).
 */
export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const lang = event.locals.settings?.language ?? 'de';
	const { query } = await event.request.json();
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
