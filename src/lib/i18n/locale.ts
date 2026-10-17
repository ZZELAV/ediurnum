import type { Lang } from '#lib/types.ts';

const DEFAULT_LOCALES: Record<Lang, string> = { de: 'de-CH', en: 'en-GB', it: 'it-IT' };

/** Default format per language if the browser doesn't give a matching one. */
export function locale(lang: Lang): string {
	return DEFAULT_LOCALES[lang];
}

/**
 * Format for dates and numbers: the first entry of `Accept-Language` with a region that matches the app language
 * (e.g. `de-DE` → "3,3", `en-US` → "Oct 10"). Otherwise the default format of the language.
 */
export function pickLocale(acceptLanguage: string | null, lang: Lang): string {
	for (const part of (acceptLanguage ?? '').slice(0, 200).split(',')) {
		const tag = part.split(';')[0].trim();
		if (!/^[a-z]{2,3}-[a-z0-9]{2,8}$/i.test(tag) || tag.split('-')[0].toLowerCase() !== lang) continue;
		try {
			return Intl.getCanonicalLocales(tag)[0];
		} catch {
			// skip an invalid entry
		}
	}
	return locale(lang);
}
