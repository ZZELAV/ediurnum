import { error } from '@sveltejs/kit';
import { isIsoDate, todayIso } from '#lib/dates.ts';

export function fail(key: string, status = 400, extra: Record<string, unknown> = {}) {
	return Response.json({ error: key, ...extra }, { status });
}

/**
 * Liest den JSON-Körper einer Anfrage. Ungültiges JSON oder etwas anderes als ein Objekt ergibt 400
 * statt eines Serverfehlers.
 */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'invalid-json');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) error(400, 'invalid-json');
	return body as Record<string, unknown>;
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
