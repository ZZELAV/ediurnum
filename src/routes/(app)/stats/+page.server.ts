import type { PageServerLoad } from './$types';
import { todayIso } from '#lib/dates.ts';
import { listEntryMeta, statsDays } from '#lib/server/entries.ts';
import { computeStats, periodStart, STATS_PERIODS, writingSummary, type StatsPeriod } from '#lib/stats.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	const requested = url.searchParams.get('period') as StatsPeriod;
	const period = STATS_PERIODS.includes(requested) ? requested : '365';
	const today = todayIso();
	const metas = listEntryMeta(); // neuester Tag zuerst
	const from = periodStart(period, today, metas.at(-1)?.date ?? null);
	return {
		period,
		summary: writingSummary(metas, today),
		stats: computeStats(statsDays(locals.session!, from), from, today)
	};
};
