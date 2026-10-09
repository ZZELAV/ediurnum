import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { isIsoDate } from '$lib/dates';
import { fail } from '$lib/server/api';
import { listEntryMeta } from '$lib/server/entries';

/** Zeigt vor einer Auswertung, welche Einträge übertragen würden. */
export const GET: RequestHandler = (event) => {
	const session = requireSession(event);
	const from = event.url.searchParams.get('from') ?? '';
	const to = event.url.searchParams.get('to') ?? '';
	if (!isIsoDate(from) || !isIsoDate(to)) return fail('common.error');
	const inRange = listEntryMeta().filter((m) => m.date >= from && m.date <= to);
	const allowed = inRange.filter((m) => m.aiAllowed);
	const locked = allowed.filter((m) => m.locked);
	const pinOpen = session.lockKey !== null;
	return json({
		send: allowed.length - (pinOpen ? 0 : locked.length),
		locked: locked.length,
		pinOpen,
		excluded: inRange.length - allowed.length
	});
};
