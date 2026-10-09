import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { plainExport } from '$lib/server/backup';
import { todayIso } from '$lib/dates';

export const GET: RequestHandler = (event) => {
	const session = requireSession(event);
	const format = event.url.searchParams.get('format') === 'json' ? 'json' : 'md';
	const { body } = plainExport(session, event.locals.lang, format);
	return new Response(body, {
		headers: {
			'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="ediurnum-export-${todayIso()}.${format}"`,
			'cache-control': 'no-store'
		}
	});
};
