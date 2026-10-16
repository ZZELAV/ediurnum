import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { readableEntries } from '#lib/server/backup.ts';
import { exportJson, exportMarkdown } from '#lib/server/export.ts';
import { exportPdf } from '#lib/server/pdf/pdf.ts';
import { pdfFonts } from '#lib/server/pdf/fonts.ts';
import { todayIso } from '#lib/dates.ts';
import { log } from '#lib/server/log.ts';

const TYPES = {
	md: 'text/markdown; charset=utf-8',
	json: 'application/json; charset=utf-8',
	pdf: 'application/pdf'
};

export const GET: RequestHandler = async (event) => {
	const session = requireSession(event);
	const param = event.url.searchParams.get('format');
	const format = param === 'json' || param === 'pdf' ? param : 'md';
	const lang = event.locals.lang;
	const { entries, skippedLocked } = readableEntries(session);
	const body =
		format === 'pdf'
			? await exportPdf(entries, lang, skippedLocked, pdfFonts)
			: format === 'json'
				? exportJson(entries, skippedLocked)
				: exportMarkdown(entries, lang);
	log.info('readable export downloaded', { format, skippedLocked });
	return new Response(body as BodyInit, {
		headers: {
			'content-type': TYPES[format],
			'content-disposition': `attachment; filename="ediurnum-export-${todayIso()}.${format}"`,
			'cache-control': 'no-store'
		}
	});
};
