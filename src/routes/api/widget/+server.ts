import { json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { clientKey } from '$lib/server/auth';
import { listEntryMeta } from '$lib/server/entries';
import { registerFailure, registerSuccess, throttleRemaining } from '$lib/server/vault';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Kennzahlen für ein Dashboard (z. B. Homepage, Widget "customapi"). Nur aktiv mit WIDGET_TOKEN;
 * Abfrage mit "Authorization: Bearer <token>". Liefert ausschliesslich unverschlüsselte Metadaten
 * (Anzahl Einträge, Datum des neuesten Eintrags) – nie Inhalte.
 */
export const GET: RequestHandler = (event) => {
	const token = env.WIDGET_TOKEN ?? '';
	if (token.length < 16) return json({ error: 'error.notFound' }, { status: 404 });

	const key = `widget:${clientKey(event)}`;
	const wait = throttleRemaining(key);
	if (wait > 0) return json({ error: 'error.throttled' }, { status: 429 });

	const given = (event.request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	if (!timingSafeEqual(digest(given), digest(token))) {
		registerFailure(key);
		return json({ error: 'error.unauthorized' }, { status: 401 });
	}
	registerSuccess(key);

	const metas = listEntryMeta(); // neuester Tag zuerst
	return json(
		{ entries: metas.length, lastEntry: metas[0]?.date ?? null },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
