import type { PageServerLoad } from './$types';
import { todayIso } from '#lib/dates.ts';
import { statsDays } from '#lib/server/entries.ts';
import { computeStats, periodStart, STATS_PERIODS, type StatsPeriod } from '#lib/stats.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	const requested = url.searchParams.get('period') as StatsPeriod;
	const period = STATS_PERIODS.includes(requested) ? requested : '365';
	const today = todayIso();
	const days = statsDays(locals.session!);
	const from = periodStart(period, today, days[0]?.date ?? null);
	return { period, total: days.length, stats: computeStats(days, from, today) };
};
