import { error, json } from '@sveltejs/kit';
import { isIsoDate, todayIso } from '$lib/dates';

export function fail(key: string, status = 400, extra: Record<string, unknown> = {}) {
	return json({ error: key, ...extra }, { status });
}

/** Prüft den Datumsparameter einer Route. */
export function dateParam(value: string): string {
	if (!isIsoDate(value)) error(404, 'not-found');
	return value;
}

/** Zukünftige Tage dürfen nicht beschrieben werden. */
export function assertNotFuture(date: string): boolean {
	return date <= todayIso();
}
