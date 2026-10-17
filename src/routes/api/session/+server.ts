import type { RequestHandler } from './$types';
import { endSession, requireSession } from '#lib/server/auth.ts';
import { markAway } from '#lib/server/vault.ts';
import { log } from '#lib/server/log.ts';

/** Keeps the session open as long as reading or writing happens in the browser (see #lib/idle). */
export const GET: RequestHandler = (event) => {
	markAway(requireSession(event), false);
	return Response.json({ ok: true });
};

/** The app was left (via sendBeacon). If it stays away longer than set, the journal is locked. */
export const POST: RequestHandler = (event) => {
	markAway(requireSession(event), true);
	return Response.json({ ok: true });
};

/** Closes the journal after inactivity in the browser. */
export const DELETE: RequestHandler = (event) => {
	endSession(event.cookies);
	log.info('journal closed automatically', { reason: 'inactivity' });
	return Response.json({ ok: true });
};
