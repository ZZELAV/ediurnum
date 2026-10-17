import { de } from './de.ts';
import { en } from './en.ts';
import { it } from './it.ts';
import type { Lang } from '#lib/types.ts';

const dictionaries: Record<Lang, Record<string, string>> = { de, en, it };

/** Languages of the app with their own name (for the selection in the settings). */
export const LANGS: Record<Lang, string> = { de: 'Deutsch', en: 'English', it: 'Italiano' };

export function isLang(v: unknown): v is Lang {
	return typeof v === 'string' && Object.hasOwn(LANGS, v);
}

/** English is the default language: for browsers in other languages and for texts missing in a language. */
export const DEFAULT_LANG: Lang = 'en';

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
	// singular: a key ending in ".one" is used when count === 1
	const singular = params?.count === 1 ? `${key}.one` : null;
	let text =
		(singular && (dictionaries[lang]?.[singular] ?? dictionaries[DEFAULT_LANG][singular])) ||
		(dictionaries[lang]?.[key] ?? dictionaries[DEFAULT_LANG][key] ?? key);
	if (params) {
		for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
	}
	return text;
}

export { locale, pickLocale } from './locale.ts';

/** Language of the browser: the first entry of `Accept-Language`, if the app knows it, otherwise English. */
export function pickLang(acceptLanguage: string | null): Lang {
	const first = (acceptLanguage ?? '').trim().split(/[-_,;\s]/)[0].toLowerCase();
	return isLang(first) ? first : DEFAULT_LANG;
}
