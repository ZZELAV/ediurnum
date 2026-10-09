import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';

/**
 * SQLite-Datenbank (node:sqlite, ohne native Zusatzpakete).
 * Inhalte liegen ausschliesslich verschlüsselt in den Spalten `payload`.
 * Klartext sind nur technische Metadaten: IDs, Datum, Zeitstempel,
 * Sperr-/KI-Flags und welche Abschnitte ein Eintrag enthält.
 */
const SCHEMA_VERSION = 2;

let db: DatabaseSync | null = null;

export function dataDir(): string {
	return resolve(env.DATA_DIR || './data');
}

export function getDb(): DatabaseSync {
	if (db) return db;
	const dir = dataDir();
	mkdirSync(dir, { recursive: true });
	db = new DatabaseSync(join(dir, 'ediurnum.db'));
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
	migrate(db);
	return db;
}

function migrate(d: DatabaseSync) {
	d.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
	const row = d.prepare(`SELECT value FROM meta WHERE key = 'schema'`).get() as { value: string } | undefined;
	const current = row ? Number(row.value) : 0;
	if (current < 1) {
		d.exec(`
			CREATE TABLE entries (
				id TEXT PRIMARY KEY,
				date TEXT NOT NULL UNIQUE,
				kinds TEXT NOT NULL DEFAULT '',
				locked INTEGER NOT NULL DEFAULT 0,
				ai_allowed INTEGER NOT NULL DEFAULT 1,
				revision INTEGER NOT NULL DEFAULT 1,
				rev_started_at TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				payload BLOB NOT NULL
			);
			CREATE TABLE entry_revisions (
				entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
				revision INTEGER NOT NULL,
				created_at TEXT NOT NULL,
				saved_at TEXT NOT NULL,
				locked INTEGER NOT NULL DEFAULT 0,
				payload BLOB NOT NULL,
				PRIMARY KEY (entry_id, revision)
			);
			CREATE TABLE analyses (
				id TEXT PRIMARY KEY,
				created_at TEXT NOT NULL,
				payload BLOB NOT NULL
			);
		`);
	}
	if (current < 2) {
		// Geräte für Push-Benachrichtigungen (enthält keine Tagebuchinhalte)
		d.exec(`
			CREATE TABLE push_subscriptions (
				endpoint TEXT PRIMARY KEY,
				keys TEXT NOT NULL,
				label TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			);
		`);
	}
	if (current < SCHEMA_VERSION) {
		d.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)`).run(String(SCHEMA_VERSION));
	}
}

export function getMeta(key: string): string | null {
	const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
	return row?.value ?? null;
}

export function setMeta(key: string, value: string | null) {
	if (value === null) getDb().prepare('DELETE FROM meta WHERE key = ?').run(key);
	else getDb().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

export function transaction<T>(fn: () => T): T {
	const d = getDb();
	d.exec('BEGIN IMMEDIATE');
	try {
		const result = fn();
		d.exec('COMMIT');
		return result;
	} catch (e) {
		d.exec('ROLLBACK');
		throw e;
	}
}

export function nowIso(): string {
	return new Date().toISOString();
}
