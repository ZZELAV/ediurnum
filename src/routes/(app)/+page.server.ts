import type { Actions, PageServerLoad } from './$types';
import { loadSettings, saveSettings } from '#lib/server/settings.ts';
import { welcomeProgress } from '#lib/server/welcome.ts';
import { addYears, todayIso } from '#lib/dates.ts';
import { getEntry, listEntryMeta, statsDays } from '#lib/server/entries.ts';
import { suggestionsFor } from '#lib/reminders.ts';
import { loadReminders } from '#lib/server/reminders.ts';
import { snippetOf } from '#lib/server/snippet.ts';
import { computeStats, periodStart, writingSummary } from '#lib/stats.ts';
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

	// "One year ago today" (and further back as long as there are entries)
	const oldest = metas.at(-1)?.date;
	const onThisDay = [];
	for (let years = 1; oldest && addYears(today, -years) >= oldest; years++) {
		const m = byDate.get(addYears(today, -years));
		if (m) onThisDay.push({ ...preview(m, 220), years });
	}

	// statistics tile: same sources as the "Statistics" page and the widget API
	const monthStart = periodStart('30', today, null);
	const stats = {
		...writingSummary(metas, today),
		mood: computeStats(statsDays(session, monthStart), monthStart, today).mood
	};

	// welcome card, until it is hidden or all steps are done
	const steps = welcomeProgress(metas);
	const welcome = !locals.settings?.welcomeHidden && Object.values(steps).some((done) => !done) ? steps : null;

	return {
		welcome,
		stats,
		todayMeta: byDate.get(today) ?? null,
		suggestions: suggestionsFor(today, metas, loadReminders()),
		onThisDay,
		recent: metas
			.filter((m) => m.date !== today)
			.slice(0, 6)
			.map((m) => preview(m)),
		hour: new Date().getHours()
	};
};

export const actions: Actions = {
	/** Hide the welcome card (can be shown again in the settings). */
	hideWelcome: ({ locals }) => {
		const session = locals.session!;
		saveSettings(session.dek, { ...loadSettings(session.dek), welcomeHidden: true });
		return { ok: true };
	}
};
