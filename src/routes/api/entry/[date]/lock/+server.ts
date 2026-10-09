import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { dateParam, fail } from '$lib/server/api';
import { LockedError, setLocked } from '$lib/server/entries';
import { hasPin } from '$lib/server/vault';

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
	return json({ ok: true });
};
