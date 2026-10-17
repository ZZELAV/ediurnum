import { gunzipSync, gzipSync } from 'node:zlib';
import { decrypt, decryptJson, encrypt, entryAad, keyFingerprint, SETTINGS_AAD, unlockWithPin } from './crypto.ts';
import { toMeta, type EntryRow } from './records.ts';
import { isEmptyContent } from '#lib/templates.ts';
import type { Entry, EntryContent, Lang } from '#lib/types.ts';

/**
 * Backup-Format (.ediurnum):
 * Eine JSON-Datei mit einem kleinen, unverschlüsselten Kopf und dem Inhalt,
 * der mit dem Hauptschlüssel (= Wiederherstellungsschlüssel) verschlüsselt ist.
 * Die Datensätze darin sind zusätzlich weiterhin einzeln verschlüsselt –
 * gesperrte Einträge bleiben also auch im Backup PIN-geschützt.
 *
 * Ohne Datenbank-Import: Dieses Modul nutzen auch das Konverter-Skript (`scripts/convert.ts`) und die Unit-Tests.
 */

const AAD = 'ediurnum/backup/v1';
/** 1: bis 0.1.0-beta.5 · 2: Einträge mit Spalte "empty" (Schema 3). Ältere Versionen bleiben lesbar. */
const VERSION = 2;

export interface BackupHeader {
	format: 'ediurnum-backup';
	version: number;
	appVersion: string;
	createdAt: string;
	keyFingerprint: string;
	data: string;
}

export interface BackupData {
	meta: Record<string, string>;
	entries: Record<string, unknown>[];
	revisions: Record<string, unknown>[];
	analyses: Record<string, unknown>[];
}

export function rowsToJson(rows: Record<string, unknown>[]) {
	return rows.map((r) => {
		const o: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? { b64: Buffer.from(v).toString('base64') } : v;
		return o;
	});
}

export function jsonToRow(o: Record<string, unknown>) {
	const r: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(o)) {
		r[k] = v && typeof v === 'object' && 'b64' in v ? Buffer.from((v as { b64: string }).b64, 'base64') : v;
	}
	return r;
}

export function encodeBackup(dek: Buffer, data: BackupData, appVersion: string): string {
	const header: BackupHeader = {
		format: 'ediurnum-backup',
		version: VERSION,
		appVersion,
		createdAt: new Date().toISOString(),
		keyFingerprint: keyFingerprint(dek),
		data: encrypt(dek, gzipSync(JSON.stringify(data)), AAD).toString('base64')
	};
	return JSON.stringify(header, null, 2);
}

/** Liest den unverschlüsselten Kopf und prüft Format und Version (ohne Schlüssel). */
export function parseBackupHeader(text: string): BackupHeader {
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
	return header;
}

export function readBackup(text: string, dek: Buffer): BackupData {
	const header = parseBackupHeader(text);
	if (header.keyFingerprint !== keyFingerprint(dek)) throw new Error('backup.wrongKey');
	try {
		return JSON.parse(gunzipSync(decrypt(dek, Buffer.from(header.data, 'base64'), AAD)).toString('utf8'));
	} catch {
		throw new Error('backup.wrongKey');
	}
}

/** Sprache aus den (verschlüsselten) Einstellungen im Backup; Deutsch, wenn keine gespeichert ist. */
export function backupLanguage(data: BackupData, dek: Buffer): Lang {
	if (!data.meta.settings) return 'de';
	const s = decryptJson<{ language?: string }>(dek, Buffer.from(data.meta.settings, 'base64'), SETTINGS_AAD);
	return s.language === 'en' ? 'en' : 'de';
}

const entryRows = (data: BackupData) => data.entries.map((o) => jsonToRow(o) as unknown as EntryRow);

/** Anzahl gesperrter Einträge im Backup (ohne komplett geleerte). */
export function lockedCount(data: BackupData): number {
	return entryRows(data).filter((r) => r.locked === 1 && r.empty !== 1).length;
}

/** PIN prüfen und den Sperr-Schlüssel liefern; null bei falscher PIN oder wenn das Backup keine PIN hat. */
export function unlockBackupPin(data: BackupData, dek: Buffer, pin: string): Promise<Buffer | null> {
	const { pin_kdf: kdf, pin_check: check } = data.meta;
	return kdf && check ? unlockWithPin(dek, pin, kdf, check) : Promise.resolve(null);
}

/**
 * Entschlüsselte Einträge aus einem Backup, ältester zuerst – wie `readableEntries` (backup.ts) in der App.
 * Gesperrte Einträge nur mit Sperr-Schlüssel, sonst zählen sie zu `skippedLocked`. Komplett geleerte fehlen.
 */
export function backupEntries(data: BackupData, dek: Buffer, lockKey: Buffer | null) {
	const entries: Entry[] = [];
	let skippedLocked = 0;
	for (const r of entryRows(data).sort((a, b) => a.date.localeCompare(b.date))) {
		if (r.empty === 1) continue;
		const key = r.locked === 1 ? lockKey : dek;
		if (!key) {
			skippedLocked++;
			continue;
		}
		const content = decryptJson<EntryContent>(key, r.payload, entryAad(r.id, r.revision));
		// Backups vor Format-Version 2 kennen die Spalte "empty" nicht
		if (r.empty === undefined && isEmptyContent(content)) continue;
		entries.push({ ...toMeta(r), content });
	}
	return { entries, skippedLocked };
}
