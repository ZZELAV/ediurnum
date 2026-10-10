import { addDays } from './dates.ts';

/**
 * Aktuelle Schreibserie: Tage am Stück mit Eintrag bis heute. Ist heute noch nichts geschrieben,
 * zählt die Serie bis gestern – sie bricht erst ab, wenn ein ganzer Tag ohne Eintrag vorbei ist.
 */
export function currentStreak(dates: Iterable<string>, today: string): number {
	const days = new Set(dates);
	let day = days.has(today) ? today : addDays(today, -1);
	let count = 0;
	while (days.has(day)) {
		count++;
		day = addDays(day, -1);
	}
	return count;
}
