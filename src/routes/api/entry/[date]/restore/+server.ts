import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { dateParam, fail } from '$lib/server/api';
import { LockedError, restoreRevision } from '$lib/server/entries';

export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const { revision } = await event.request.json();
	try {
		const ok = restoreRevision(session, dateParam(event.params.date), Number(revision));
		return ok ? json({ ok }) : fail('error.notFound', 404);
	} catch (e) {
		if (e instanceof LockedError) return fail('error.locked', 423);
		throw e;
	}
};
