import type { Lang } from '#lib/types.ts';

/** Languages of the app with their own name (for the selection in the settings). */
export const LANGS: Record<Lang, string> = { de: 'Deutsch', en: 'English', it: 'Italiano' };

export function isLang(v: unknown): v is Lang {
	return typeof v === 'string' && Object.hasOwn(LANGS, v);
}

/** English is the default language: for browsers in other languages and for texts missing in a language. */
export const DEFAULT_LANG: Lang = 'en';
