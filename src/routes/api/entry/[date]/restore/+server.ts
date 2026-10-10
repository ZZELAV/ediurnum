import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { dateParam, fail, readJson } from '#lib/server/api.ts';
import { LockedError, restoreRevision } from '#lib/server/entries.ts';

export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const { revision } = await readJson(event.request);
	try {
		const ok = restoreRevision(session, dateParam(event.params.date), Number(revision));
		return ok ? Response.json({ ok }) : fail('error.notFound', 404);
	} catch (e) {
		if (e instanceof LockedError) return fail('error.locked', 423);
		throw e;
	}
};
