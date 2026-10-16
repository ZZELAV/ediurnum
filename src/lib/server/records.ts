import type { EntryMeta, SectionKind } from '#lib/types.ts';

/**
 * Zeile der Tabelle `entries` – gemeinsam für die Datenbank (entries.ts) und das Lesen von Backups
 * (backup-file.ts, auch im Konverter-Skript). Ohne Datenbank-Import, damit das Skript es laden kann.
 */
export interface EntryRow {
	id: string;
	date: string;
	kinds: string;
	locked: number;
	ai_allowed: number;
	/** fehlt in Backups vor Format-Version 2 */
	empty: number;
	revision: number;
	rev_started_at: string;
	created_at: string;
	updated_at: string;
	payload: Uint8Array;
}

export function toMeta(r: EntryRow): EntryMeta {
	return {
		id: r.id,
		date: r.date,
		kinds: (r.kinds ? r.kinds.split(',') : []) as SectionKind[],
		locked: r.locked === 1,
		aiAllowed: r.ai_allowed === 1,
		revision: r.revision,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}
