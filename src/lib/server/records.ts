import { decryptJson, entryAad } from './crypto.ts';
import { upgradeContent, upgradeKind } from '#lib/templates.ts';
import type { EntryContent, EntryMeta, SectionKind } from '#lib/types.ts';

/**
 * Row of the `entries` table – shared by the database (entries.ts) and by reading backups
 * (backup-file.ts, also in the converter script). No database import, so the script can load it.
 */
export interface EntryRow {
	id: string;
	date: string;
	kinds: string;
	locked: number;
	ai_allowed: number;
	/** missing in backups before format version 2 */
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
		// legacy names: backups up to format version 2 (the database is migrated in schema 4)
		kinds: (r.kinds ? r.kinds.split(',').map(upgradeKind) : []) as SectionKind[],
		locked: r.locked === 1,
		aiAllowed: r.ai_allowed === 1,
		revision: r.revision,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

/**
 * Decrypts the content of an entry or revision. Always use this instead of `decryptJson`: it converts legacy
 * section names (stored up to 1.0.0), so the rest of the app only sees current names.
 */
export function decryptContent(key: Buffer, payload: Uint8Array, entryId: string, revision: number): EntryContent {
	return upgradeContent(decryptJson<EntryContent>(key, payload, entryAad(entryId, revision)));
}
