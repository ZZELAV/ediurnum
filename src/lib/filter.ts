import type { SectionKind } from './types.ts';

/**
 * Filter für „Alle Einträge“ (Kalender und Suchergebnisse). Innerhalb einer Gruppe genügt ein Treffer
 * (Stimmung 1 oder 2), zwischen den Gruppen muss alles passen (Stimmung und Rückblick). Leere Gruppen filtern nicht.
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
