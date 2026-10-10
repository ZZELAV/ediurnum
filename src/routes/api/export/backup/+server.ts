import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { createBackup } from '#lib/server/backup.ts';
import { todayIso } from '#lib/dates.ts';
import { log } from '#lib/server/log.ts';
import { nowIso, setMeta } from '#lib/server/db.ts';

export const GET: RequestHandler = (event) => {
	const session = requireSession(event);
	log.info('backup downloaded');
	setMeta('backup_last', nowIso()); // nur der Zeitpunkt, für die Willkommenskarte
	return new Response(createBackup(session.dek), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="ediurnum-backup-${todayIso()}.ediurnum"`,
			'cache-control': 'no-store'
		}
	});
};
