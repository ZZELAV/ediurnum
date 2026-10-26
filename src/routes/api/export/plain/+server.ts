import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { readableEntries } from '#lib/server/backup.ts';
import { exportJson, exportMarkdown } from '#lib/server/export.ts';
import { exportPdf } from '#lib/server/pdf/pdf.ts';
import { pdfFonts } from '#lib/server/pdf/fonts.ts';
import { parseRange, todayIso } from '#lib/dates.ts';
import { log } from '#lib/server/log.ts';

const TYPES = {
	md: 'text/markdown; charset=utf-8',
	json: 'application/json; charset=utf-8',
	pdf: 'application/pdf'
};

export const GET: RequestHandler = async (event) => {
	const session = requireSession(event);
	const params = event.url.searchParams;
	const param = params.get('format');
	const format = param === 'json' || param === 'pdf' ? param : 'md';
	// optional range ("From"/"To"); without it everything is exported
	const range = parseRange(params.get('from'), params.get('to'));
	const ranged = !!(range.from || range.to);
	const loc = event.locals.locale;
	const { entries, skippedLocked } = readableEntries(session, range);
	const body =
		format === 'pdf'
			? await exportPdf(entries, loc, skippedLocked, pdfFonts)
			: format === 'json'
				? exportJson(entries, skippedLocked)
				: exportMarkdown(entries, loc);
	log.info('readable export downloaded', { format, skippedLocked, ranged });
	const name = ranged ? `${range.from ?? entries[0]?.date ?? todayIso()}_${range.to ?? todayIso()}` : todayIso();
	return new Response(body as BodyInit, {
		headers: {
			'content-type': TYPES[format],
			'content-disposition': `attachment; filename="ediurnum-export-${name}.${format}"`,
			'cache-control': 'no-store'
		}
	});
};
