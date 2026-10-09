import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { createBackup } from '$lib/server/backup';
import { todayIso } from '$lib/dates';
import { log } from '$lib/server/log';

export const GET: RequestHandler = (event) => {
	const session = requireSession(event);
	log.info('backup downloaded');
	return new Response(createBackup(session.dek), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="ediurnum-backup-${todayIso()}.ediurnum"`,
			'cache-control': 'no-store'
		}
	});
};
