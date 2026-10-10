import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { dateParam, fail } from '#lib/server/api.ts';
import { LockedError, setLocked } from '#lib/server/entries.ts';
import { hasPin } from '#lib/server/vault.ts';

export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const date = dateParam(event.params.date);
	if (!hasPin()) return fail('error.noPin');
	const { locked } = await event.request.json();
	try {
		setLocked(session, date, Boolean(locked));
	} catch (e) {
		if (e instanceof LockedError) return fail('error.locked', 423);
		throw e;
	}
	return Response.json({ ok: true });
};
