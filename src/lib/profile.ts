/**
 * Self-assessment ("About me"). Filled in first after setup, can be adapted in the
 * settings and serves the AI as background for every analysis.
 *
 * Structure based on proven methods:
 * - Big Five (five personality dimensions) as a short self-assessment on a 5-point scale
 * - life satisfaction as a baseline (cf. Cantril ladder)
 * - values, strengths, challenges and goals (cf. TELOS from the project "fabric")
 * - experience with journaling, expectations and topics the AI should treat with care
 *
 * Never rename field IDs (stored answers depend on them).
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

/** Free text fields in display order. */
export const PROFILE_TEXTS = ['life', 'strengths', 'challenges', 'goals', 'coping', 'hopes', 'sensitive'] as const;
export type ProfileText = (typeof PROFILE_TEXTS)[number];

export interface Profile {
	journaling: Journaling | '';
	satisfaction: number | null; // 1–5
	traits: Partial<Record<Trait, number | null>>; // 1–5 between two poles
	values: string[];
	texts: Partial<Record<ProfileText, string>>;
	updatedAt: string;
}

export function emptyProfile(): Profile {
	return { journaling: '', satisfaction: null, traits: {}, values: [], texts: {}, updatedAt: '' };
}

const scale = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

/** Sanitizes input from the browser. */
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
 * Self-assessment as Markdown for the AI file. `tr` translates text keys,
 * so the function works the same in the browser and on the server.
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
