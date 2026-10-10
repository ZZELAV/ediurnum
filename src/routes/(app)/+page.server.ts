import type { Actions, PageServerLoad } from './$types';
import { loadSettings, saveSettings } from '#lib/server/settings.ts';
import { welcomeProgress } from '#lib/server/welcome.ts';
import { addYears, todayIso } from '#lib/dates.ts';
import { getEntry, listEntryMeta, moodSeries } from '#lib/server/entries.ts';
import { pinnedAnalysis } from '#lib/server/analyses.ts';
import { suggestionsFor } from '#lib/reminders.ts';
import { loadReminders } from '#lib/server/reminders.ts';
import { snippetOf } from '#lib/server/snippet.ts';
import type { EntryMeta } from '#lib/types.ts';

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

	// Willkommenskarte, bis sie ausgeblendet wird oder alle Schritte erledigt sind
	const steps = welcomeProgress(metas);
	const welcome = !locals.settings?.welcomeHidden && Object.values(steps).some((done) => !done) ? steps : null;

	return {
		welcome,
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

export const actions: Actions = {
	/** Willkommenskarte ausblenden (in den Einstellungen wieder einblendbar). */
	hideWelcome: ({ locals }) => {
		const session = locals.session!;
		saveSettings(session.dek, { ...loadSettings(session.dek), welcomeHidden: true });
		return { ok: true };
	}
};
