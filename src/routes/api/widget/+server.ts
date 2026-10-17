import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { WIDGET_TOKEN } from '$app/env/private';
import { clientKey } from '#lib/server/auth.ts';
import { listEntryMeta } from '#lib/server/entries.ts';
import { todayIso } from '#lib/dates.ts';
import { writingSummary } from '#lib/stats.ts';
import { registerFailure, registerSuccess, throttleRemaining } from '#lib/server/vault.ts';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Figures for a dashboard (e.g. Homepage, widget "customapi"). Only active with WIDGET_TOKEN;
 * request with "Authorization: Bearer <token>". Returns only unencrypted metadata
 * (number of entries, time of the latest save, written today, current streak) – never content.
 */
export const GET: RequestHandler = (event) => {
	const token = WIDGET_TOKEN ?? '';
	if (token.length < 16) return Response.json({ error: 'error.notFound' }, { status: 404 });

	const key = `widget:${clientKey(event)}`;
	const wait = throttleRemaining(key);
	if (wait > 0) return Response.json({ error: 'error.throttled' }, { status: 429 });

	const given = (event.request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	if (!timingSafeEqual(digest(given), digest(token))) {
		registerFailure(key);
		return Response.json({ error: 'error.unauthorized' }, { status: 401 });
	}
	registerSuccess(key);

	// same figures as dashboard and statistics
	return Response.json(writingSummary(listEntryMeta(), todayIso()), { headers: { 'cache-control': 'no-store' } });
};
