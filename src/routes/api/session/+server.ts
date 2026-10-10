import type { RequestHandler } from './$types';
import { endSession, requireSession } from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';

/** Hält die Sitzung offen, solange im Browser gelesen oder geschrieben wird (siehe #lib/idle). */
export const GET: RequestHandler = (event) => {
	requireSession(event);
	return Response.json({ ok: true });
};

/** Schliesst das Tagebuch nach Inaktivität im Browser. */
export const DELETE: RequestHandler = (event) => {
	endSession(event.cookies);
	log.info('journal closed automatically', { reason: 'inactivity' });
	return Response.json({ ok: true });
};
