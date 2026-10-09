import { decryptJson, encryptJson } from './crypto';
import { getDb } from './db';
import type { Analysis } from '$lib/types';

const aad = (id: string) => `analysis:${id}`;

interface Row {
	id: string;
	created_at: string;
	payload: Uint8Array;
}

export function listAnalyses(dek: Buffer): Analysis[] {
	const rows = getDb().prepare('SELECT * FROM analyses ORDER BY created_at DESC').all() as unknown as Row[];
	return rows.map((r) => decryptJson<Analysis>(dek, r.payload, aad(r.id)));
}

export function saveAnalysis(dek: Buffer, a: Analysis) {
	getDb()
		.prepare('INSERT OR REPLACE INTO analyses (id, created_at, payload) VALUES (?, ?, ?)')
		.run(a.id, a.createdAt, encryptJson(dek, a, aad(a.id)));
}

export function deleteAnalysis(id: string) {
	getDb().prepare('DELETE FROM analyses WHERE id = ?').run(id);
}

/** Es gibt immer höchstens eine "angeheftete" Auswertung, deren Fokuspunkte das Dashboard zeigt. */
export function pinAnalysis(dek: Buffer, id: string | null) {
	for (const a of listAnalyses(dek)) {
		const pinned = a.id === id;
		if (a.pinned !== pinned) saveAnalysis(dek, { ...a, pinned });
	}
}

export function pinnedAnalysis(dek: Buffer): Analysis | null {
	return listAnalyses(dek).find((a) => a.pinned) ?? null;
}
