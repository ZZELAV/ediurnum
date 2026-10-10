import { de } from './de.ts';
import { en } from './en.ts';
import type { Lang } from '#lib/types.ts';

export const LANGS: Lang[] = ['de', 'en'];
const dictionaries: Record<Lang, Record<string, string>> = { de, en };

export function isLang(v: unknown): v is Lang {
	return v === 'de' || v === 'en';
}

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
	// Einzahl: Schlüssel mit Endung ".one" wird verwendet, wenn count === 1
	const singular = params?.count === 1 ? `${key}.one` : null;
	let text =
		(singular && (dictionaries[lang]?.[singular] ?? dictionaries.de[singular])) ||
		(dictionaries[lang]?.[key] ?? dictionaries.de[key] ?? key);
	if (params) {
		for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
	}
	return text;
}

export { locale, pickLocale } from './locale.ts';

export function pickLang(acceptLanguage: string | null): Lang {
	return acceptLanguage && /^en\b/i.test(acceptLanguage.trim()) ? 'en' : 'de';
}
