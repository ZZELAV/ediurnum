import { DEFAULT_LANG, isLang } from './langs.ts';
import { AUTO_REGION, countryOfTimeZone } from './regions.ts';
import type { Lang } from '#lib/types.ts';

/**
 * Locale = language of the app plus country of the device (e.g. `de-CH`). It decides the format of dates and
 * numbers and the spelling variant of the texts (see translate). The language is set in the app, the country
 * comes from Settings → Region or – with "automatic" – from the device.
 */

const DEFAULT_LOCALES: Record<Lang, string> = { de: 'de-DE', en: 'en-US', it: 'it-IT' };

/** Default locale of a language, if the country is unknown or has no format of its own for it. */
export function locale(lang: Lang): string {
	return DEFAULT_LOCALES[lang];
}

/** Language of a locale such as `de-CH` (unknown ones: English). */
export function langOf(tag: string): Lang {
	const lang = tag.split('-')[0].toLowerCase();
	return isLang(lang) ? lang : DEFAULT_LANG;
}

/** Stored locale such as `de-CH` or a language such as `de` (only languages of the app). */
export function isLocale(v: unknown): v is string {
	return typeof v === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(v) && isLang(v.slice(0, 2));
}

/** Country of a locale such as `de-CH`, or null. */
export function regionOf(tag: string): string | null {
	const region = tag.split('-')[1];
	return region && /^[a-z]{2}$/i.test(region) ? region.toUpperCase() : null;
}

/** Language and country as a locale, if the format data (ICU) knows this combination, otherwise the default. */
export function localeFor(lang: Lang, country: string | null): string {
	if (country && /^[A-Z]{2}$/.test(country)) {
		const tag = `${lang}-${country}`;
		// unknown combinations such as de-US fall back to "de" – then the default of the language applies
		if (new Intl.DateTimeFormat(tag).resolvedOptions().locale === tag) return tag;
	}
	return locale(lang);
}

/** Entries of Accept-Language with a country, in order (e.g. ["de-CH", "en-US"]). */
function browserLocales(acceptLanguage: string | null): string[] {
	return (acceptLanguage ?? '')
		.slice(0, 200)
		.split(',')
		.map((part) => part.split(';')[0].trim())
		.filter((tag) => /^[a-z]{2,3}-[a-z]{2}$/i.test(tag));
}

/**
 * Country of the device, the first one with a format for the app language:
 * 1. country of the device time zone (Europe/Zurich → CH) – phones set it from their location, while e.g. Safari
 *    on an iPhone in Switzerland often reports "de-DE" as browser language,
 * 2. country of a browser language matching the app language (de-AT for German),
 * 3. country of another browser language (fr-CH → CH).
 * If none of them has a format for the language, the first known country (the default format applies then).
 */
export function detectCountry(acceptLanguage: string | null, lang: Lang, timeZone?: string | null): string | null {
	const tags = browserLocales(acceptLanguage);
	const matching = tags.filter((tag) => tag.split('-')[0].toLowerCase() === lang);
	const others = tags.filter((tag) => !matching.includes(tag));
	const candidates = [countryOfTimeZone(timeZone), ...[...matching, ...others].map(regionOf)].filter((c): c is string => !!c);
	return candidates.find((c) => localeFor(lang, c) === `${lang}-${c}`) ?? candidates[0] ?? null;
}

/** Locale for the app language and the country of the device (see detectCountry). */
export function pickLocale(acceptLanguage: string | null, lang: Lang, timeZone?: string | null): string {
	return localeFor(lang, detectCountry(acceptLanguage, lang, timeZone));
}

/**
 * Locale for the settings: a chosen region (Settings → Region) or, with "auto", the country of the device.
 * `deviceCountry` is the detected country (for the label "Automatic (…)"), also when a region is chosen.
 */
export function resolveLocale(
	lang: Lang,
	region: string | null | undefined,
	acceptLanguage: string | null,
	timeZone?: string | null
): { locale: string; deviceCountry: string | null } {
	const deviceCountry = detectCountry(acceptLanguage, lang, timeZone);
	const chosen = region && region !== AUTO_REGION ? region : null;
	return { locale: localeFor(lang, chosen ?? deviceCountry), deviceCountry };
}
