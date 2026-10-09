import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { assertNotFuture, dateParam, fail } from '$lib/server/api';
import { deleteEntry, LockedError, saveEntry } from '$lib/server/entries';
import { sanitizeContent } from '$lib/templates';

export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const date = dateParam(event.params.date);
	if (!assertNotFuture(date)) return fail('error.futureDate');
	const body = await event.request.json();
	try {
		const meta = saveEntry(session, date, sanitizeContent(body.content));
		return json({ meta });
	} catch (e) {
		if (e instanceof LockedError) return fail('error.locked', 423);
		throw e;
	}
};

export const DELETE: RequestHandler = (event) => {
	requireSession(event);
	deleteEntry(dateParam(event.params.date));
	return json({ ok: true });
};
