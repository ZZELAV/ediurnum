import { de } from './de.ts';
import { en } from './en.ts';
import type { Lang } from '#lib/types.ts';

const dictionaries: Record<Lang, Record<string, string>> = { de, en };

export function isLang(v: unknown): v is Lang {
	return v === 'de' || v === 'en';
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

export function pickLang(acceptLanguage: string | null): Lang {
	return acceptLanguage && /^de\b/i.test(acceptLanguage.trim()) ? 'de' : DEFAULT_LANG;
}
