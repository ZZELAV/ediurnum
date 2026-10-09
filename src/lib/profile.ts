/**
 * Selbsteinschätzung („Über mich“). Wird nach der Einrichtung als erstes ausgefüllt, kann in den
 * Einstellungen angepasst werden und dient der KI als Hintergrund für jede Auswertung.
 *
 * Aufbau angelehnt an bewährte Methoden:
 * - Big Five (fünf Persönlichkeitsdimensionen) als kurze Selbsteinschätzung auf einer 5er-Skala
 * - Lebenszufriedenheit als Ausgangswert (vgl. Cantril-Leiter)
 * - Werte, Stärken, Herausforderungen und Ziele (vgl. TELOS aus dem Projekt „fabric“)
 * - Erfahrung mit Tagebuch, Erwartungen und Themen, die die KI behutsam behandeln soll
 *
 * Feld-IDs nie umbenennen (gespeicherte Antworten hängen daran).
 */

export const TRAITS = ['extraversion', 'agreeableness', 'conscientiousness', 'stability', 'openness'] as const;
export type Trait = (typeof TRAITS)[number];

export const VALUES = [
	'family',
	'friendship',
	'partnership',
	'health',
	'freedom',
	'security',
	'achievement',
	'creativity',
	'learning',
	'nature',
	'spirituality',
	'justice',
	'adventure',
	'calm',
	'responsibility',
	'joy'
] as const;

export const JOURNALING = ['none', 'past', 'occasional', 'regular'] as const;
export type Journaling = (typeof JOURNALING)[number];

/** Freitextfelder in Anzeigereihenfolge. */
export const PROFILE_TEXTS = ['life', 'strengths', 'challenges', 'goals', 'coping', 'hopes', 'sensitive'] as const;
export type ProfileText = (typeof PROFILE_TEXTS)[number];

export interface Profile {
	journaling: Journaling | '';
	satisfaction: number | null; // 1–5
	traits: Partial<Record<Trait, number | null>>; // 1–5 zwischen zwei Polen
	values: string[];
	texts: Partial<Record<ProfileText, string>>;
	updatedAt: string;
}

export function emptyProfile(): Profile {
	return { journaling: '', satisfaction: null, traits: {}, values: [], texts: {}, updatedAt: '' };
}

const scale = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

/** Bereinigt eine Eingabe aus dem Browser. */
export function sanitizeProfile(input: unknown): Profile {
	const raw = (input ?? {}) as Partial<Profile>;
	const traits: Profile['traits'] = {};
	for (const t of TRAITS) traits[t] = scale(raw.traits?.[t]);
	const texts: Profile['texts'] = {};
	for (const k of PROFILE_TEXTS) {
		const v = raw.texts?.[k];
		if (typeof v === 'string' && v.trim()) texts[k] = v.slice(0, 4000);
	}
	return {
		journaling: JOURNALING.includes(raw.journaling as Journaling) ? (raw.journaling as Journaling) : '',
		satisfaction: scale(raw.satisfaction),
		traits,
		values: Array.isArray(raw.values) ? VALUES.filter((v) => raw.values!.includes(v)) : [],
		texts,
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : ''
	};
}

export function isEmptyProfile(p: Profile): boolean {
	return (
		!p.journaling &&
		p.satisfaction === null &&
		Object.values(p.traits).every((v) => v === null || v === undefined) &&
		p.values.length === 0 &&
		Object.values(p.texts).every((v) => !v?.trim())
	);
}

/**
 * Selbsteinschätzung als Markdown für die KI-Datei. `tr` übersetzt Textschlüssel,
 * damit die Funktion im Browser und auf dem Server gleich funktioniert.
 */
export function profileMarkdown(p: Profile, name: string, tr: (key: string) => string): string {
	const lines: string[] = [];
	if (name.trim()) lines.push(`- ${tr('profile.ai.name')}: ${name.trim()}`);
	if (p.journaling) lines.push(`- ${tr('profile.journaling')}: ${tr(`profile.journaling.${p.journaling}`)}`);
	if (p.satisfaction) lines.push(`- ${tr('profile.satisfaction')}: ${p.satisfaction}/5`);
	const traits = TRAITS.filter((t) => p.traits[t]);
	if (traits.length) {
		lines.push(`- ${tr('profile.ai.traits')}:`);
		for (const t of traits) {
			lines.push(`  - ${tr(`profile.trait.${t}`)}: ${p.traits[t]}/5 (1 = ${tr(`profile.trait.${t}.low`)}, 5 = ${tr(`profile.trait.${t}.high`)})`);
		}
	}
	if (p.values.length) lines.push(`- ${tr('profile.values')}: ${p.values.map((v) => tr(`profile.value.${v}`)).join(', ')}`);
	for (const k of PROFILE_TEXTS) {
		const v = p.texts[k]?.trim();
		if (v) lines.push(`- ${tr(`profile.${k}`)}: ${v.replace(/\s*\n\s*/g, ' ')}`);
	}
	return lines.join('\n');
}
