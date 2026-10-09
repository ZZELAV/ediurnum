import { page } from '$app/state';
import { isLang, locale, translate } from './index';
import type { Lang } from '$lib/types';

/** Aktuelle Sprache der Seite (aus den Layout-Daten). */
export function currentLang(): Lang {
	const l = page.data?.lang;
	return isLang(l) ? l : 'de';
}

/** Übersetzt einen Schlüssel in die aktuelle Sprache. Nur in Komponenten verwenden. */
export function t(key: string, params?: Record<string, string | number>): string {
	return translate(currentLang(), key, params);
}

export function fmtDate(iso: string, style: 'long' | 'medium' | 'short' | 'weekday' | 'dayMonth' = 'long'): string {
	const opts: Intl.DateTimeFormatOptions =
		style === 'long'
			? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
			: style === 'medium'
				? { day: 'numeric', month: 'long', year: 'numeric' }
				: style === 'weekday'
					? { weekday: 'short', day: 'numeric' }
					: style === 'dayMonth'
						? { weekday: 'short', day: 'numeric', month: 'short' }
						: { day: '2-digit', month: '2-digit', year: 'numeric' };
	return new Intl.DateTimeFormat(locale(currentLang()), { ...opts, timeZone: 'UTC' }).format(
		new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso)
	);
}

export function fmtDateTime(iso: string): string {
	return new Intl.DateTimeFormat(locale(currentLang()), {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
}

export function fmtTime(iso: string | number): string {
	return new Intl.DateTimeFormat(locale(currentLang()), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Name eines Wochentags (0 = Sonntag). */
export function weekdayName(day: number, style: 'long' | 'short' = 'long'): string {
	return new Intl.DateTimeFormat(locale(currentLang()), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
}

/** Wochentage in Anzeigereihenfolge ab Montag. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
