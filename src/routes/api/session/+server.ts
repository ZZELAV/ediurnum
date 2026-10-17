import type { RequestHandler } from './$types';
import { endSession, requireSession } from '#lib/server/auth.ts';
import { markAway } from '#lib/server/vault.ts';
import { log } from '#lib/server/log.ts';

/** The app is in the foreground (again), see #lib/away. */
export const GET: RequestHandler = (event) => {
	markAway(requireSession(event), false);
	return Response.json({ ok: true });
};

/** The app was left (via sendBeacon). If it stays away longer than set, the journal is locked. */
export const POST: RequestHandler = (event) => {
	markAway(requireSession(event), true);
	return Response.json({ ok: true });
};

/** Closes the journal when the app was away for longer than set (noticed by the browser when coming back). */
export const DELETE: RequestHandler = (event) => {
	endSession(event.cookies);
	log.info('journal closed automatically', { reason: 'left-app' });
	return Response.json({ ok: true });
};
