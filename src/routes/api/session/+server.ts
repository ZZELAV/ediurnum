import type { RequestHandler } from './$types';
import { endSession, requireSession } from '#lib/server/auth.ts';
import { markAway } from '#lib/server/vault.ts';
import { log } from '#lib/server/log.ts';

/** Hält die Sitzung offen, solange im Browser gelesen oder geschrieben wird (siehe #lib/idle). */
export const GET: RequestHandler = (event) => {
	markAway(requireSession(event), false);
	return Response.json({ ok: true });
};

/** Die App wurde verlassen (per sendBeacon). Bleibt sie länger weg als eingestellt, ist das Tagebuch gesperrt. */
export const POST: RequestHandler = (event) => {
	markAway(requireSession(event), true);
	return Response.json({ ok: true });
};

/** Schliesst das Tagebuch nach Inaktivität im Browser. */
export const DELETE: RequestHandler = (event) => {
	endSession(event.cookies);
	log.info('journal closed automatically', { reason: 'inactivity' });
	return Response.json({ ok: true });
};
