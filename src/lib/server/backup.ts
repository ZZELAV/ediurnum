import { gunzipSync, gzipSync } from 'node:zlib';
import { decrypt, encrypt, keyFingerprint } from './crypto';
import { getDb, getMeta, setMeta, transaction } from './db';
import { formatEntries } from './ai/analyze';
import { listEntryMeta, getEntry } from './entries';
import type { Session } from './vault';
import type { Entry, Lang } from '#lib/types.ts';

/**
 * Backup-Format (.ediurnum):
 * Eine JSON-Datei mit einem kleinen, unverschlüsselten Kopf und dem Inhalt,
 * der mit dem Hauptschlüssel (= Wiederherstellungsschlüssel) verschlüsselt ist.
 * Die Datensätze darin sind zusätzlich weiterhin einzeln verschlüsselt –
 * gesperrte Einträge bleiben also auch im Backup PIN-geschützt.
 */

const AAD = 'ediurnum/backup/v1';
/** 1: bis 0.1.0-beta.5 · 2: Einträge mit Spalte "empty" (Schema 3). Ältere Versionen bleiben lesbar. */
const VERSION = 2;
const META_KEYS = ['created_at', 'settings', 'profile', 'pin_kdf', 'pin_check', 'reminders'];

interface BackupHeader {
	format: 'ediurnum-backup';
	version: number;
	appVersion: string;
	createdAt: string;
	keyFingerprint: string;
	data: string;
}

interface BackupData {
	meta: Record<string, string>;
	entries: Record<string, unknown>[];
	revisions: Record<string, unknown>[];
	analyses: Record<string, unknown>[];
}

function rowsToJson(rows: Record<string, unknown>[]) {
	return rows.map((r) => {
		const o: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? { b64: Buffer.from(v).toString('base64') } : v;
		return o;
	});
}

function jsonToRow(o: Record<string, unknown>) {
	const r: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(o)) {
		r[k] = v && typeof v === 'object' && 'b64' in v ? Buffer.from((v as { b64: string }).b64, 'base64') : v;
	}
	return r;
}

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
	const header: BackupHeader = {
		format: 'ediurnum-backup',
		version: VERSION,
		appVersion: __APP_VERSION__,
		createdAt: new Date().toISOString(),
		keyFingerprint: keyFingerprint(dek),
		data: encrypt(dek, gzipSync(JSON.stringify(data)), AAD).toString('base64')
	};
	return JSON.stringify(header, null, 2);
}

export function readBackup(text: string, dek: Buffer): BackupData {
	let header: BackupHeader;
	try {
		header = JSON.parse(text);
	} catch {
		throw new Error('backup.invalidFile');
	}
	if (header?.format !== 'ediurnum-backup' || !Number.isInteger(header.version) || header.version < 1) {
		throw new Error('backup.invalidFile');
	}
	if (header.version > VERSION) throw new Error('backup.tooNew');
	if (header.keyFingerprint !== keyFingerprint(dek)) throw new Error('backup.wrongKey');
	try {
		return JSON.parse(gunzipSync(decrypt(dek, Buffer.from(header.data, 'base64'), AAD)).toString('utf8'));
	} catch {
		throw new Error('backup.wrongKey');
	}
}

function insertRows(table: string, rows: Record<string, unknown>[]) {
	const d = getDb();
	// nur bekannte Spalten – die Namen landen im SQL
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

/** Spielt ein Backup in eine leere Datenbank ein (beim Einrichten). */
export function restoreBackup(data: BackupData) {
	transaction(() => {
		const d = getDb();
		d.exec('DELETE FROM entry_revisions; DELETE FROM entries; DELETE FROM analyses;');
		for (const k of META_KEYS) setMeta(k, data.meta[k] ?? null);
		insertRows('entries', data.entries);
		insertRows('entry_revisions', data.revisions);
		insertRows('analyses', data.analyses);
	});
}

/** Lesbarer Export (Klartext!) aller Einträge, die aktuell entschlüsselt werden können. */
export function plainExport(session: Session, lang: Lang, format: 'md' | 'json') {
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
	if (format === 'json') {
		return {
			body: JSON.stringify(
				{ format: 'ediurnum-plain', exportedAt: new Date().toISOString(), skippedLocked, entries },
				null,
				2
			),
			skippedLocked
		};
	}
	const title = lang === 'en' ? '# ediurnum – Journal' : '# ediurnum – Tagebuch';
	return { body: `${title}\n\n${formatEntries(entries, lang).replace(/^### /gm, '## ')}\n`, skippedLocked };
}
