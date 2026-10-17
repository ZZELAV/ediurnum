import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { assertNotFuture, dateParam, fail, readJson } from '#lib/server/api.ts';
import { deleteEntry, isLocked, LockedError, saveEntry } from '#lib/server/entries.ts';
import { sanitizeContent } from '#lib/templates.ts';

export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const date = dateParam(event.params.date);
	if (!assertNotFuture(date)) return fail('error.futureDate');
	const body = await readJson(event.request);
	try {
		const meta = saveEntry(session, date, sanitizeContent(body.content));
		return Response.json({ meta });
	} catch (e) {
		if (e instanceof LockedError) return fail('error.locked', 423);
		throw e;
	}
};

/** Delete. Locked entries only with the PIN entered. */
export const DELETE: RequestHandler = (event) => {
	const session = requireSession(event);
	const date = dateParam(event.params.date);
	if (isLocked(date) && !session.lockKey) return fail('error.locked', 423);
	deleteEntry(date);
	return Response.json({ ok: true });
};
