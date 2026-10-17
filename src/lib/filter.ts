import type { SectionKind } from './types.ts';

/**
 * Filter for „Alle Einträge“ (calendar and search results). Within a group one match is enough
 * (mood 1 or 2), between the groups everything has to match (mood and review). Empty groups don't filter.
 */
export interface DayFilter {
	moods: number[];
	kinds: SectionKind[];
	emotions: string[];
}

export function matchesFilter(day: { mood: number | null; kinds: string[]; emotions: string[] }, f: DayFilter): boolean {
	if (f.moods.length && (day.mood === null || !f.moods.includes(day.mood))) return false;
	if (f.kinds.length && !f.kinds.some((k) => day.kinds.includes(k))) return false;
	if (f.emotions.length && !f.emotions.some((e) => day.emotions.includes(e))) return false;
	return true;
}
