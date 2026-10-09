import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { dateParam } from '$lib/server/api';
import { setAiAllowed } from '$lib/server/entries';

export const POST: RequestHandler = async (event) => {
	requireSession(event);
	const { allowed } = await event.request.json();
	setAiAllowed(dateParam(event.params.date), Boolean(allowed));
	return json({ ok: true });
};
