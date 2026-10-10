import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { WIDGET_TOKEN } from '$app/env/private';
import { clientKey } from '#lib/server/auth.ts';
import { listEntryMeta } from '#lib/server/entries.ts';
import { registerFailure, registerSuccess, throttleRemaining } from '#lib/server/vault.ts';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Kennzahlen für ein Dashboard (z. B. Homepage, Widget "customapi"). Nur aktiv mit WIDGET_TOKEN;
 * Abfrage mit "Authorization: Bearer <token>". Liefert ausschliesslich unverschlüsselte Metadaten
 * (Anzahl Einträge, Datum des neuesten Eintrags) – nie Inhalte.
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

	const metas = listEntryMeta(); // neuester Tag zuerst
	return Response.json(
		{ entries: metas.length, lastEntry: metas[0]?.date ?? null },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
