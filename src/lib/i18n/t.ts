import { page } from '$app/state';
import { DEFAULT_LANG, isLang, locale, translate } from './index.ts';
import type { Lang } from '#lib/types.ts';

/** Current language of the page (from the layout data). */
function currentLang(): Lang {
	const l = page.data?.lang;
	return isLang(l) ? l : DEFAULT_LANG;
}

/**
 * Locale for formats and texts (determined by the server from the device). If it doesn't match the current
 * language – e.g. right after switching the language –, the default format of the language applies.
 */
export function currentLocale(): string {
	const lang = currentLang();
	const l = page.data?.locale;
	return typeof l === 'string' && l.split('-')[0] === lang ? l : locale(lang);
}

/** Number in the user's format, e.g. 3.3 (de-CH) or 3,3 (de-DE). */
export function fmtNumber(value: number, digits = 1): string {
	return new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Translates a key into the current language (spelling of the country, e.g. de-CH). Use in components only. */
export function t(key: string, params?: Record<string, string | number>): string {
	return translate(currentLocale(), key, params);
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
		// weekday always first – en-US would otherwise write "8 Thu"
		const part = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? '';
		return currentLang() === 'de' ? `${part('weekday')}, ${part('day')}.` : `${part('weekday')} ${part('day')}`;
	}
	return fmt.format(date);
}

/** Month name for "YYYY-MM": short ("Oct") or long with the year ("October 2026"). */
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

/** Name of a weekday (0 = Sunday). */
export function weekdayName(day: number, style: 'long' | 'short' = 'long'): string {
	return new Intl.DateTimeFormat(currentLocale(), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
}

/** Weekdays in display order, starting with Monday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
