import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endSession, requireSession } from '$lib/server/auth';
import { log } from '$lib/server/log';

/** Hält die Sitzung offen, solange im Browser gelesen oder geschrieben wird (siehe $lib/idle). */
export const GET: RequestHandler = (event) => {
	requireSession(event);
	return json({ ok: true });
};

/** Schliesst das Tagebuch nach Inaktivität im Browser. */
export const DELETE: RequestHandler = (event) => {
	endSession(event.cookies);
	log.info('journal closed automatically', { reason: 'inactivity' });
	return json({ ok: true });
};
