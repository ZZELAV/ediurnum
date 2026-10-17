import { error } from '@sveltejs/kit';
import { isIsoDate, todayIso } from '#lib/dates.ts';

export function fail(key: string, status = 400, extra: Record<string, unknown> = {}) {
	return Response.json({ error: key, ...extra }, { status });
}

/**
 * Reads the JSON body of a request. Invalid JSON or anything other than an object results in 400
 * instead of a server error.
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

/** Checks the date parameter of a route. */
export function dateParam(value: string): string {
	if (!isIsoDate(value)) error(404, 'not-found');
	return value;
}

/** Future days must not be written. */
export function assertNotFuture(date: string): boolean {
	return date <= todayIso();
}
