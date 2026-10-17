import { encodeBackup, jsonToRow, rowsToJson, type BackupData } from './backup-file.ts';
import { getDb, getMeta, setMeta, transaction, upgradeLegacyKinds } from './db.ts';
import { listEntryMeta, getEntry } from './entries.ts';
import type { Session } from './vault.ts';
import type { Entry } from '#lib/types.ts';

const META_KEYS = ['created_at', 'settings', 'profile', 'pin_kdf', 'pin_check', 'reminders'];

export function createBackup(dek: Buffer): string {
	const d = getDb();
	const meta: Record<string, string> = {};
	for (const k of META_KEYS) {
		const v = getMeta(k);
		if (v !== null) meta[k] = v;
	}
	const data: BackupData = {
		meta,
		entries: rowsToJson(d.prepare('SELECT * FROM entries').all() as Record<string, unknown>[]),
		revisions: rowsToJson(d.prepare('SELECT * FROM entry_revisions').all() as Record<string, unknown>[]),
		analyses: rowsToJson(d.prepare('SELECT * FROM analyses').all() as Record<string, unknown>[])
	};
	return encodeBackup(dek, data, __APP_VERSION__);
}

function insertRows(table: string, rows: Record<string, unknown>[]) {
	const d = getDb();
	// known columns only – the names end up in the SQL
	const known = new Set((d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
	for (const o of rows) {
		const r = jsonToRow(o);
		for (const k of Object.keys(r)) if (!known.has(k)) delete r[k];
		const cols = Object.keys(r);
		d.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
			...(Object.values(r) as (string | number | Buffer | null)[])
		);
	}
}

/** Restores a backup into an empty database (during setup). */
export function restoreBackup(data: BackupData) {
	transaction(() => {
		const d = getDb();
		d.exec('DELETE FROM entry_revisions; DELETE FROM entries; DELETE FROM analyses;');
		for (const k of META_KEYS) setMeta(k, data.meta[k] ?? null);
		insertRows('entries', data.entries);
		insertRows('entry_revisions', data.revisions);
		insertRows('analyses', data.analyses);
		// backups up to format version 2 still use the legacy section kinds
		upgradeLegacyKinds(d);
	});
}

/** All entries that can currently be decrypted (oldest first), for the readable export. */
export function readableEntries(session: Session) {
	const entries: Entry[] = [];
	let skippedLocked = 0;
	for (const m of [...listEntryMeta()].reverse()) {
		const e = getEntry(session, m.date);
		if (!e?.content) {
			skippedLocked++;
			continue;
		}
		entries.push(e);
	}
	return { entries, skippedLocked };
}
