import type { Lang } from '#lib/types.ts';

/** Standard-Format pro Sprache, wenn der Browser nichts Passendes angibt. */
export function locale(lang: Lang): string {
	return lang === 'de' ? 'de-CH' : 'en-GB';
}

/**
 * Format für Datum und Zahlen: die erste Angabe aus `Accept-Language` mit Region, die zur App-Sprache passt
 * (z. B. `de-DE` → „3,3“, `en-US` → „Oct 10“). Sonst das Standard-Format der Sprache.
 */
export function pickLocale(acceptLanguage: string | null, lang: Lang): string {
	for (const part of (acceptLanguage ?? '').slice(0, 200).split(',')) {
		const tag = part.split(';')[0].trim();
		if (!/^[a-z]{2,3}-[a-z0-9]{2,8}$/i.test(tag) || tag.split('-')[0].toLowerCase() !== lang) continue;
		try {
			return Intl.getCanonicalLocales(tag)[0];
		} catch {
			// ungültige Angabe überspringen
		}
	}
	return locale(lang);
}
