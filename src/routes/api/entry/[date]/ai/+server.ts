import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { dateParam, readJson } from '#lib/server/api.ts';
import { setAiAllowed } from '#lib/server/entries.ts';

export const POST: RequestHandler = async (event) => {
	requireSession(event);
	const { allowed } = await readJson(event.request);
	setAiAllowed(dateParam(event.params.date), Boolean(allowed));
	return Response.json({ ok: true });
};
