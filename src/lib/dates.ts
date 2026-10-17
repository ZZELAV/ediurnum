/** Date helpers. A day is always represented as "YYYY-MM-DD" (local date). */

export function isIsoDate(v: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
	const d = new Date(v + 'T00:00:00Z');
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Today's date in the local time zone (server: environment variable TZ). */
export function todayIso(now = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
	const d = new Date(iso + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
	return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000);
}

export function monthKey(iso: string): string {
	return iso.slice(0, 7);
}

/** Same calendar day `years` years earlier or later (29 February → 28 February). */
export function addYears(iso: string, years: number): string {
	const y = Number(iso.slice(0, 4)) + years;
	const md = iso.slice(5);
	const candidate = `${String(y).padStart(4, '0')}-${md}`;
	return isIsoDate(candidate) ? candidate : `${String(y).padStart(4, '0')}-02-28`;
}

/** Weekday of a date, 0 = Sunday. */
export function weekdayOf(iso: string): number {
	return new Date(iso + 'T00:00:00Z').getUTCDay();
}

/** Month ("YYYY-MM") shifted by `months` months. */
export function addMonths(month: string, months: number): string {
	const [y, m] = month.split('-').map(Number);
	const total = y * 12 + (m - 1) + months;
	return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}
