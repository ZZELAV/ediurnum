import { addDays, addMonths, daysBetween, monthKey, weekdayOf } from './dates.ts';
import { EMOTIONS } from './templates.ts';
import type { SectionKind } from './types.ts';

/** Gefühle, die als angenehm gelten (der Rest gilt als belastend); Reihenfolge wie in EMOTIONS. */
export const PLEASANT_EMOTIONS = EMOTIONS.slice(0, EMOTIONS.indexOf('tired'));

export const STATS_PERIODS = ['30', '90', '365', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/**
 * Aktuelle Schreibserie: Tage am Stück mit Eintrag bis heute. Ist heute noch nichts geschrieben,
 * zählt die Serie bis gestern – sie bricht erst ab, wenn ein ganzer Tag ohne Eintrag vorbei ist.
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
	/** Zeitpunkt (ISO, UTC) der letzten Speicherung irgendeines Eintrags – nicht nur das Datum. */
	lastEntry: string | null;
	writtenToday: boolean;
	streak: number;
}

/**
 * Kennzahlen aus den Klartext-Metadaten (ohne Inhalte) – die eine Quelle für Widget-API, Dashboard und Statistik.
 * `metas` sind alle geschriebenen Einträge (ohne geleerte), z. B. aus `listEntryMeta()`.
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
	longest: { length: number; from: string; to: string } | null;
	mood: Average;
	energy: Average;
	/**
	 * Stimmungsverlauf, älteste zuerst: pro Tag oder – bei mehr als TREND_DAILY_MAX_DAYS Tagen – als
	 * Wochendurchschnitt (Datum = Montag der Woche, frühestens `from`).
	 */
	moodTrend: { weekly: boolean; points: { date: string; mood: number }[] };
	/** Stimmung und Energie pro Monat, neuester Monat zuerst. */
	byMonth: { month: string; written: number; mood: Average; energy: Average }[];
	byWeekday: ({ weekday: number } & Average)[];
	emotions: { id: string; count: number; pleasant: boolean }[];
	/** Mögliche Wochen- bzw. Monatsrückblicke (aus der Länge des Zeitraums) und wie viele geschrieben sind. */
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

/** Bis zu so vielen Tagen zeigt der Stimmungsverlauf einzelne Tage, darüber Wochen. */
const TREND_DAILY_MAX_DAYS = 90;

/** Durchschnittliche Monatslänge in Tagen */
const DAYS_PER_MONTH = 365.25 / 12;

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
 * Statistik für den Zeitraum `from`–`to` (beide eingeschlossen). `all` sind geschriebene Tage, auch
 * ausserhalb des Zeitraums. Die aktuelle Serie steht in `writingSummary`.
 */
export function computeStats(all: StatsDay[], from: string, to: string): Stats {
	const days = all.filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
	const readable = days.filter((d) => d.content);
	const moodOf = (d: StatsDay) => (isScale(d.content?.mood) ? d.content.mood : null);

	// Monate lückenlos von `to` zurück bis `from`, neuester zuerst
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

	// Mögliche Rückblicke aus der Länge des Zeitraums (12 Monate = 52 Wochen, 12 Monate), nicht aus den
	// berührten Kalenderwochen/-monaten – sonst zählten die angebrochenen an beiden Enden mit (53 bzw. 13).
	// Geschrieben: Wochen (ab Montag) bzw. Monate mit Rückblick, höchstens so viele wie möglich.
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
