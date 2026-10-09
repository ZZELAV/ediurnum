import { addDays, daysBetween, isIsoDate } from './dates.ts';
import type { EntryMeta, Lang, SectionKind } from './types';

/**
 * Erinnerungen für die wiederkehrenden Rückblicke und eigene Erinnerungen.
 * Der Zeitplan enthält keine Tagebuchinhalte und wird deshalb unverschlüsselt
 * gespeichert – nur so kann der Server Push-Nachrichten schicken, während das
 * Tagebuch gesperrt ist.
 */
export interface ReminderConfig {
	gefuehl: { enabled: boolean; weekday: number; time: string }; // 0 = Sonntag
	wachstum: { enabled: boolean; day: number | 'last'; time: string };
	custom: CustomReminder[];
	lang: Lang;
}

export type CustomRepeat = 'once' | 'daily' | 'weekly' | 'monthly';
export const CUSTOM_REPEATS: CustomRepeat[] = ['once', 'daily', 'weekly', 'monthly'];
export const MAX_CUSTOM_REMINDERS = 50;

/** Zeitplan einer Erinnerung. Je nach `repeat` zählt `date`, `weekdays` oder `day`. */
export interface ReminderSchedule {
	repeat: CustomRepeat;
	date: string; // einmalig: YYYY-MM-DD
	weekdays: number[]; // wöchentlich: 0 = Sonntag
	day: number | 'last'; // monatlich
	time: string; // HH:MM
}

/**
 * Eigene Erinnerung. Titel und Text liegen wie der übrige Zeitplan unverschlüsselt vor,
 * damit der Server sie auch bei geschlossenem Tagebuch verschicken kann.
 */
export interface CustomReminder extends ReminderSchedule {
	id: string;
	title: string;
	body: string;
	enabled: boolean;
	createdAt: string;
}

export function defaultReminders(lang: Lang = 'de'): ReminderConfig {
	return {
		gefuehl: { enabled: true, weekday: 0, time: '19:00' },
		wachstum: { enabled: true, day: 'last', time: '19:00' },
		custom: [],
		lang
	};
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type CustomReminderError =
	| 'reminders.errorTitle'
	| 'reminders.errorTime'
	| 'reminders.errorDate'
	| 'reminders.errorWeekdays'
	| 'reminders.errorLimit';

/** Prüft eine eigene Erinnerung. Gibt die bereinigte Erinnerung oder einen Fehlerschlüssel zurück. */
export function sanitizeCustomReminder(input: unknown): CustomReminder | CustomReminderError {
	const raw = (input ?? {}) as Partial<CustomReminder>;
	const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 100) : '';
	if (!title) return 'reminders.errorTitle';
	const repeat = CUSTOM_REPEATS.includes(raw.repeat as CustomRepeat) ? (raw.repeat as CustomRepeat) : 'daily';
	if (typeof raw.time !== 'string' || !TIME_RE.test(raw.time)) return 'reminders.errorTime';
	const date = typeof raw.date === 'string' && isIsoDate(raw.date) ? raw.date : '';
	if (repeat === 'once' && !date) return 'reminders.errorDate';
	const weekdays = Array.isArray(raw.weekdays)
		? [...new Set(raw.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
		: [];
	if (repeat === 'weekly' && weekdays.length === 0) return 'reminders.errorWeekdays';
	const day = raw.day === 'last' ? 'last' : Number(raw.day);
	return {
		id: typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : '',
		title,
		body: typeof raw.body === 'string' ? raw.body.trim().slice(0, 300) : '',
		enabled: raw.enabled !== false,
		repeat,
		date: repeat === 'once' ? date : '',
		weekdays: repeat === 'weekly' ? weekdays : [],
		day: repeat === 'monthly' && (day === 'last' || (Number.isInteger(day) && day >= 1 && day <= 28)) ? day : 1,
		time: raw.time,
		createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : ''
	};
}

export function sanitizeReminders(input: unknown, lang: Lang): ReminderConfig {
	const d = defaultReminders(lang);
	const raw = (input ?? {}) as Partial<ReminderConfig>;
	const time = (v: unknown, fallback: string) => (typeof v === 'string' && TIME_RE.test(v) ? v : fallback);
	const weekday = Number(raw.gefuehl?.weekday);
	const day = raw.wachstum?.day === 'last' ? 'last' : Number(raw.wachstum?.day);
	return {
		gefuehl: {
			enabled: Boolean(raw.gefuehl?.enabled),
			weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : d.gefuehl.weekday,
			time: time(raw.gefuehl?.time, d.gefuehl.time)
		},
		wachstum: {
			enabled: Boolean(raw.wachstum?.enabled),
			day: day === 'last' || (Number.isInteger(day) && day >= 1 && day <= 28) ? day : d.wachstum.day,
			time: time(raw.wachstum?.time, d.wachstum.time)
		},
		custom: (Array.isArray(raw.custom) ? raw.custom : [])
			.map(sanitizeCustomReminder)
			.filter((r): r is CustomReminder => typeof r !== 'string' && r.id !== '')
			.slice(0, MAX_CUSTOM_REMINDERS),
		lang
	};
}

function weekdayOf(iso: string): number {
	return new Date(iso + 'T00:00:00Z').getUTCDay();
}

/** Letzter Tag mit dem gewünschten Wochentag am oder vor `date`. */
export function lastWeekdayOnOrBefore(date: string, weekday: number): string {
	return addDays(date, -((weekdayOf(date) - weekday + 7) % 7));
}

function monthDue(year: number, month: number, day: number | 'last'): string {
	const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const d = day === 'last' ? last : Math.min(day, last);
	return new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10);
}

/** Letzter Fälligkeitstag des Monatsrückblicks am oder vor `date`. */
export function lastMonthlyDueOnOrBefore(date: string, day: number | 'last'): string {
	const d = new Date(date + 'T00:00:00Z');
	const thisMonth = monthDue(d.getUTCFullYear(), d.getUTCMonth(), day);
	return thisMonth <= date ? thisMonth : monthDue(d.getUTCFullYear(), d.getUTCMonth() - 1, day);
}

export function minutesOf(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
}

/** Fällt die Erinnerung auf diesen Tag? */
export function occursOn(s: ReminderSchedule, date: string): boolean {
	switch (s.repeat) {
		case 'once':
			return s.date === date;
		case 'daily':
			return true;
		case 'weekly':
			return s.weekdays.includes(weekdayOf(date));
		case 'monthly':
			return lastMonthlyDueOnOrBefore(date, s.day) === date;
	}
}

/** Nächster Tag, an dem die Erinnerung ansteht (heute nur, wenn die Uhrzeit noch nicht vorbei ist). */
export function nextOccurrence(s: ReminderSchedule, today: string, nowMinutes: number): string | null {
	if (s.repeat === 'once') return s.date > today || (s.date === today && minutesOf(s.time) > nowMinutes) ? s.date : null;
	for (let i = 0; i <= 62; i++) {
		const d = addDays(today, i);
		if (occursOn(s, d) && (i > 0 || minutesOf(s.time) > nowMinutes)) return d;
	}
	return null;
}

function doneBetween(metas: EntryMeta[], kind: SectionKind, from: string, to: string): boolean {
	return metas.some((m) => m.kinds.includes(kind) && m.date >= from && m.date <= to);
}

/**
 * Fällig, wenn seit dem letzten Erinnerungstag (mit 3 bzw. 5 Tagen Vorlauf,
 * damit man es auch etwas früher erledigen kann) kein entsprechender Abschnitt geschrieben wurde.
 */
export function isGefuehlDue(date: string, metas: EntryMeta[], cfg: ReminderConfig): boolean {
	if (!cfg.gefuehl.enabled) return false;
	const occurrence = lastWeekdayOnOrBefore(date, cfg.gefuehl.weekday);
	return !doneBetween(metas, 'gefuehl', addDays(occurrence, -3), date);
}

export function isWachstumDue(date: string, metas: EntryMeta[], cfg: ReminderConfig): boolean {
	if (!cfg.wachstum.enabled) return false;
	const due = lastMonthlyDueOnOrBefore(date, cfg.wachstum.day);
	return !doneBetween(metas, 'wachstum', addDays(due, -5), date);
}

export interface Suggestions {
	gefuehl: { suggested: boolean; daysSince: number | null };
	wachstum: { suggested: boolean };
}

/**
 * Hinweise in der App (Dashboard und Eintrag). Ein heute bereits geschriebener
 * Rückblick zählt als erledigt; `daysSince` bezieht sich auf frühere Tage.
 */
export function suggestionsFor(date: string, metas: EntryMeta[], cfg: ReminderConfig): Suggestions {
	const past = metas.filter((m) => m.date <= date);
	const lastGefuehl = past.find((m) => m.date !== date && m.kinds.includes('gefuehl'))?.date ?? null;
	return {
		gefuehl: {
			suggested: isGefuehlDue(date, past, cfg),
			daysSince: lastGefuehl ? daysBetween(lastGefuehl, date) : null
		},
		wachstum: { suggested: isWachstumDue(date, past, cfg) }
	};
}

/** Eigene Erinnerung mit nächster Fälligkeit für die Anzeige. */
export interface CustomReminderView extends CustomReminder {
	next: string | null;
	today: boolean;
}
