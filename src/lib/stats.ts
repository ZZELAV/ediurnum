import { addDays, daysBetween, monthKey } from './dates.ts';
import { currentStreak } from './streak.ts';
import { EMOTIONS } from './templates.ts';
import type { SectionKind } from './types';

/** Gefühle, die als angenehm gelten (der Rest gilt als belastend); Reihenfolge wie in EMOTIONS. */
export const PLEASANT_EMOTIONS = EMOTIONS.slice(0, EMOTIONS.indexOf('tired'));

export const STATS_PERIODS = ['30', '90', '365', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/**
 * Ein geschriebener Tag. Datum und Abschnittsarten sind Klartext-Metadaten und zählen immer;
 * `content` fehlt bei gesperrten Einträgen ohne offene PIN.
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
	currentStreak: number;
	longest: { length: number; from: string; to: string } | null;
	mood: Average;
	energy: Average;
	/** Stimmung (mood) und Energie pro Monat. */
	byMonth: { month: string; written: number; mood: Average; energy: Average }[];
	byWeekday: ({ weekday: number } & Average)[];
	emotions: { id: string; count: number; pleasant: boolean }[];
	/** Wochen (ab Montag) bzw. Monate im Zeitraum und wie viele davon einen Rückblick haben. */
	weeklyReviews: { done: number; total: number };
	monthlyReviews: { done: number; total: number };
	/** Gesperrte Einträge, deren Stimmung und Gefühle nicht mitzählen (PIN nicht offen). */
	hidden: number;
}

/** Erster Tag des Zeitraums; „all“ beginnt beim ersten Eintrag. */
export function periodStart(period: StatsPeriod, today: string, firstEntry: string | null): string {
	if (period === 'all') return firstEntry && firstEntry < today ? firstEntry : today;
	return addDays(today, 1 - Number(period));
}

function average(values: number[]): Average {
	return { avg: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null, count: values.length };
}

const isScale = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

/** Wochentag eines Datums, 0 = Sonntag. */
const weekdayOf = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay();
/** Montag der Woche eines Datums. */
const mondayOf = (iso: string) => addDays(iso, -((weekdayOf(iso) + 6) % 7));

/** Längste Folge aufeinanderfolgender Tage in einer aufsteigend sortierten Liste. */
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
 * Statistik für den Zeitraum `from`–`to` (beide eingeschlossen). `all` sind alle geschriebenen Tage;
 * die aktuelle Serie zählt unabhängig vom Zeitraum bis `to`.
 */
export function computeStats(all: StatsDay[], from: string, to: string): Stats {
	const days = all.filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
	const readable = days.filter((d) => d.content);
	const moodOf = (d: StatsDay) => (isScale(d.content?.mood) ? d.content.mood : null);

	// Monate lückenlos von `from` bis `to`
	const months: string[] = [];
	for (let m = monthKey(from); m <= monthKey(to); ) {
		months.push(m);
		const [y, mo] = m.split('-').map(Number);
		m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
	}
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

	// Montag zuerst
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

	// Wochen, die ganz oder teilweise im Zeitraum liegen
	const weeks = new Set<string>();
	for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) weeks.add(w);
	const weeksDone = new Set(days.filter((d) => d.kinds.includes('gefuehl')).map((d) => mondayOf(d.date)));
	const monthsDone = new Set(days.filter((d) => d.kinds.includes('wachstum')).map((d) => monthKey(d.date)));

	return {
		from,
		to,
		days: daysBetween(from, to) + 1,
		written: days.length,
		currentStreak: currentStreak(all.map((d) => d.date), to),
		longest: longestRun(days.map((d) => d.date)),
		mood: average(readable.map(moodOf).filter((m) => m !== null)),
		energy: average(readable.map((d) => d.content!.energy).filter(isScale)),
		byMonth,
		byWeekday,
		emotions,
		weeklyReviews: { done: weeksDone.size, total: weeks.size },
		monthlyReviews: { done: monthsDone.size, total: months.length },
		hidden: days.length - readable.length
	};
}
