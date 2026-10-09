import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { createBackup } from '$lib/server/backup';
import { todayIso } from '$lib/dates';

export const GET: RequestHandler = (event) => {
	const session = requireSession(event);
	return new Response(createBackup(session.dek), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="ediurnum-backup-${todayIso()}.ediurnum"`,
			'cache-control': 'no-store'
		}
	});
};
