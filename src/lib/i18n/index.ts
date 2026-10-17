import { de } from './de.ts';
import { deCH } from './de-CH.ts';
import { en } from './en.ts';
import { enGB } from './en-GB.ts';
import { it } from './it.ts';
import { DEFAULT_LANG, isLang } from './langs.ts';
import { langOf, regionOf } from './locale.ts';
import type { Lang } from '#lib/types.ts';

const dictionaries: Record<Lang, Record<string, string>> = { de, en, it };

/**
 * Spelling variants: only the texts that differ from the language file (de.ts: Germany, en.ts: USA).
 * Switzerland and Liechtenstein write "ss" instead of "ß"; English uses British spelling except in US_SPELLING.
 */
const VARIANTS: Record<string, Record<string, string>> = { 'de-CH': deCH, 'en-GB': enGB };

/** English with American spelling: the USA and its territories, the Philippines, Canada ("analyze", "customize"). */
const US_SPELLING = ['US', 'AS', 'GU', 'MP', 'PR', 'UM', 'VI', 'PH', 'CA'];

function variantOf(tag: string): Record<string, string> | null {
	const lang = langOf(tag);
	const region = regionOf(tag);
	if (lang === 'de' && (region === 'CH' || region === 'LI')) return VARIANTS['de-CH'];
	if (lang === 'en' && region && !US_SPELLING.includes(region)) return VARIANTS['en-GB'];
	return null;
}

export { DEFAULT_LANG, isLang, LANGS } from './langs.ts';
export { detectCountry, isLocale, langOf, locale, localeFor, pickLocale, regionOf, resolveLocale } from './locale.ts';
export { AUTO_REGION, isRegion, REGIONS } from './regions.ts';

/**
 * Text for a key in a locale (`de-CH`) or a language (`de`): spelling variant of the country, then the language,
 * then English (texts missing in a language appear in English).
 */
export function translate(tag: string, key: string, params?: Record<string, string | number>): string {
	let text = key;
	for (const dict of [variantOf(tag), dictionaries[langOf(tag)], dictionaries[DEFAULT_LANG]]) {
		if (!dict) continue;
		// singular: a key ending in ".one" is used when count === 1
		const one = params?.count === 1 && Object.hasOwn(dict, `${key}.one`);
		if (one || Object.hasOwn(dict, key)) {
			text = dict[one ? `${key}.one` : key];
			break;
		}
	}
	if (params) {
		for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
	}
	return text;
}

/** Language of the browser: the first entry of `Accept-Language`, if the app knows it, otherwise English. */
export function pickLang(acceptLanguage: string | null): Lang {
	const first = (acceptLanguage ?? '').trim().split(/[-_,;\s]/)[0].toLowerCase();
	return isLang(first) ? first : DEFAULT_LANG;
}
