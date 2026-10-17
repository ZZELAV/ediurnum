import { addDays, addMonths, daysBetween, monthKey, weekdayOf } from './dates.ts';
import { EMOTIONS } from './templates.ts';
import type { SectionKind } from './types.ts';

/** Feelings that count as pleasant (the rest count as unpleasant); order as in EMOTIONS. */
export const PLEASANT_EMOTIONS = EMOTIONS.slice(0, EMOTIONS.indexOf('tired'));

export const STATS_PERIODS = ['30', '90', '365', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/**
 * Current writing streak: consecutive days with an entry up to today. If nothing has been written today yet,
 * the streak counts up to yesterday – it only breaks once a whole day without an entry has passed.
 */
export function currentStreak(dates: Iterable<string>, today: string): number {
	const days = new Set(dates);
	let day = days.has(today) ? today : addDays(today, -1);
	let count = 0;
	while (days.has(day)) {
		count++;
		day = addDays(day, -1);
	}
	return count;
}

export interface WritingSummary {
	entries: number;
	/** Time (ISO, UTC) of the latest save of any entry – not just the date. */
	lastEntry: string | null;
	writtenToday: boolean;
	streak: number;
}

/**
 * Figures from the plain-text metadata (no content) – the one source for the widget API, dashboard and statistics.
 * `metas` are all written entries (without cleared ones), e.g. from `listEntryMeta()`.
 */
export function writingSummary(metas: { date: string; updatedAt: string }[], today: string): WritingSummary {
	return {
		entries: metas.length,
		lastEntry: metas.reduce<string | null>((max, m) => (max && max > m.updatedAt ? max : m.updatedAt), null),
		writtenToday: metas.some((m) => m.date === today),
		streak: currentStreak(
			metas.map((m) => m.date),
			today
		)
	};
}

/**
 * A written day. Date and section kinds are plain-text metadata and always count;
 * `content` is missing for locked entries without an open PIN.
 */
export interface StatsDay {
	date: string;
	kinds: SectionKind[];
	content: { mood: number | null; energy: number | null; emotions: string[] } | null;
}

export interface Average {
	avg: number | null;
	count: number;
}

export interface Stats {
	from: string;
	to: string;
	days: number;
	written: number;
	longest: { length: number; from: string; to: string } | null;
	mood: Average;
	energy: Average;
	/**
	 * Mood over time, oldest first: per day or – for more than TREND_DAILY_MAX_DAYS days – as a
	 * weekly average (date = Monday of the week, at the earliest `from`).
	 */
	moodTrend: { weekly: boolean; points: { date: string; mood: number }[] };
	/** Mood and energy per month, newest month first. */
	byMonth: { month: string; written: number; mood: Average; energy: Average }[];
	byWeekday: ({ weekday: number } & Average)[];
	emotions: { id: string; count: number; pleasant: boolean }[];
	/** Possible weekly or monthly reviews (from the length of the period) and how many are written. */
	weeklyReviews: { done: number; total: number };
	monthlyReviews: { done: number; total: number };
	/** Locked entries whose mood and feelings don't count (PIN not open). */
	hidden: number;
}

/** First day of the period; „all“ starts at the first entry. */
export function periodStart(period: StatsPeriod, today: string, firstEntry: string | null): string {
	if (period === 'all') return firstEntry && firstEntry < today ? firstEntry : today;
	return addDays(today, 1 - Number(period));
}

function average(values: number[]): Average {
	return { avg: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null, count: values.length };
}

const isScale = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

/** Up to this many days the mood chart shows single days, above it weeks. */
const TREND_DAILY_MAX_DAYS = 90;

/** Average length of a month in days */
const DAYS_PER_MONTH = 365.25 / 12;

/** Monday of the week of a date. */
const mondayOf = (iso: string) => addDays(iso, -((weekdayOf(iso) + 6) % 7));

/** Longest run of consecutive days in an ascending list. */
function longestRun(dates: string[]): Stats['longest'] {
	let best: Stats['longest'] = null;
	let start = 0;
	for (let i = 0; i < dates.length; i++) {
		if (i > 0 && daysBetween(dates[i - 1], dates[i]) !== 1) start = i;
		const length = i - start + 1;
		if (!best || length > best.length) best = { length, from: dates[start], to: dates[i] };
	}
	return best;
}

/**
 * Statistics for the period `from`–`to` (both included). `all` are written days, also
 * outside the period. The current streak is in `writingSummary`.
 */
export function computeStats(all: StatsDay[], from: string, to: string): Stats {
	const days = all.filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
	const readable = days.filter((d) => d.content);
	const moodOf = (d: StatsDay) => (isScale(d.content?.mood) ? d.content.mood : null);

	// months without gaps from `to` back to `from`, newest first
	const months: string[] = [];
	for (let m = monthKey(to); m >= monthKey(from); m = addMonths(m, -1)) months.push(m);
	const byMonth = months.map((month) => {
		const inMonth = days.filter((d) => monthKey(d.date) === month);
		const readableInMonth = inMonth.filter((d) => d.content);
		return {
			month,
			written: inMonth.length,
			mood: average(readableInMonth.map(moodOf).filter((m) => m !== null)),
			energy: average(readableInMonth.map((d) => d.content!.energy).filter(isScale))
		};
	});

	// Monday first
	const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
		weekday,
		...average(readable.filter((d) => weekdayOf(d.date) === weekday).map(moodOf).filter((m) => m !== null))
	}));

	const counts = new Map<string, number>();
	for (const d of readable) {
		for (const id of new Set(d.content!.emotions)) {
			if (EMOTIONS.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
		}
	}
	const emotions = [...counts]
		.map(([id, count]) => ({ id, count, pleasant: PLEASANT_EMOTIONS.includes(id) }))
		.sort((a, b) => b.count - a.count || EMOTIONS.indexOf(a.id) - EMOTIONS.indexOf(b.id));

	// possible reviews from the length of the period (12 months = 52 weeks, 12 months), not from the
	// calendar weeks/months it touches – otherwise the partial ones at both ends would count too (53 and 13).
	// written: weeks (from Monday) or months with a review, at most as many as possible.
	const length = daysBetween(from, to) + 1;
	const reviews = (kind: SectionKind, period: (iso: string) => string, total: number) => {
		const done = new Set(days.filter((d) => d.kinds.includes(kind)).map((d) => period(d.date))).size;
		return { done: Math.min(done, total), total };
	};

	const moodDays = readable.flatMap((d) => {
		const mood = moodOf(d);
		return mood === null ? [] : [{ date: d.date, mood }];
	});
	const weekly = length > TREND_DAILY_MAX_DAYS;
	const byWeek = new Map<string, number[]>();
	for (const p of weekly ? moodDays : []) {
		const monday = mondayOf(p.date);
		const key = monday < from ? from : monday;
		byWeek.set(key, [...(byWeek.get(key) ?? []), p.mood]);
	}
	const moodTrend = {
		weekly,
		points: weekly ? [...byWeek].map(([date, moods]) => ({ date, mood: average(moods).avg! })) : moodDays
	};

	return {
		from,
		to,
		days: length,
		written: days.length,
		longest: longestRun(days.map((d) => d.date)),
		mood: average(readable.map(moodOf).filter((m) => m !== null)),
		energy: average(readable.map((d) => d.content!.energy).filter(isScale)),
		moodTrend,
		byMonth,
		byWeekday,
		emotions,
		weeklyReviews: reviews('feelings', mondayOf, Math.max(1, Math.round(length / 7))),
		monthlyReviews: reviews('growth', monthKey, Math.max(1, Math.round(length / DAYS_PER_MONTH))),
		hidden: days.length - readable.length
	};
}
