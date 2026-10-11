import { page } from '$app/state';
import { isLang, locale, translate } from './index';
import type { Lang } from '#lib/types.ts';

/** Aktuelle Sprache der Seite (aus den Layout-Daten). */
export function currentLang(): Lang {
	const l = page.data?.lang;
	return isLang(l) ? l : 'de';
}

/**
 * Format für Datum und Zahlen (vom Server aus Accept-Language bestimmt). Passt es nicht zur aktuellen
 * Sprache – etwa direkt nach einem Sprachwechsel –, gilt das Standard-Format der Sprache.
 */
export function currentLocale(): string {
	const lang = currentLang();
	const l = page.data?.locale;
	return typeof l === 'string' && l.split('-')[0] === lang ? l : locale(lang);
}

/** Zahl im Format des Nutzers, z. B. 3.3 (de-CH) oder 3,3 (de-DE). */
export function fmtNumber(value: number, digits = 1): string {
	return new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
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
	const fmt = new Intl.DateTimeFormat(currentLocale(), { ...opts, timeZone: 'UTC' });
	const date = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
	if (style === 'weekday') {
		// Wochentag immer zuerst – en-US würde sonst „8 Thu“ schreiben
		const part = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? '';
		return currentLang() === 'de' ? `${part('weekday')}, ${part('day')}.` : `${part('weekday')} ${part('day')}`;
	}
	return fmt.format(date);
}

/** Monatsname zu "YYYY-MM": kurz („Okt“) oder lang mit Jahr („Oktober 2026“). */
export function fmtMonth(month: string, style: 'short' | 'long' = 'long'): string {
	const opts: Intl.DateTimeFormatOptions = style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' };
	return new Intl.DateTimeFormat(currentLocale(), { ...opts, timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'));
}

export function fmtDateTime(iso: string): string {
	return new Intl.DateTimeFormat(currentLocale(), {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date(iso));
}

export function fmtTime(iso: string | number): string {
	return new Intl.DateTimeFormat(currentLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Name eines Wochentags (0 = Sonntag). */
export function weekdayName(day: number, style: 'long' | 'short' = 'long'): string {
	return new Intl.DateTimeFormat(currentLocale(), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
}

/** Wochentage in Anzeigereihenfolge ab Montag. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
