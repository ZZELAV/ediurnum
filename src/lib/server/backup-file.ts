import { gunzipSync, gzipSync } from 'node:zlib';
import { decrypt, decryptJson, encrypt, keyFingerprint, SETTINGS_AAD, unlockWithPin } from './crypto.ts';
import { decryptContent, toMeta, type EntryRow } from './records.ts';
import { isEmptyContent } from '#lib/templates.ts';
import { DEFAULT_LANG, isLang, isLocale } from '#lib/i18n/index.ts';
import type { Entry } from '#lib/types.ts';

/**
 * Backup format (.ediurnum):
 * A JSON file with a small, unencrypted header and the content,
 * encrypted with the master key (= recovery key).
 * The records inside are still encrypted individually as well –
 * so locked entries stay PIN-protected in the backup too.
 *
 * No database import: the converter script (`scripts/convert.ts`) and the unit tests use this module as well.
 */

const AAD = 'ediurnum/backup/v1';
/**
 * 1: up to 0.1.0-beta.5 · 2: entries with column "empty" (schema 3) · 3: English section kinds (schema 4, 1.1.0).
 * Older versions stay readable (legacy kinds are converted when read and restored); older apps reject version 3.
 */
const VERSION = 3;
/** Upper limit for the unpacked content – far above real backups (the records inside are encrypted and barely compress) */
const MAX_UNPACKED = 256 * 1024 * 1024;

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

/** Reads the unencrypted header and checks format and version (without a key). */
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
		const json = gunzipSync(decrypt(dek, Buffer.from(header.data, 'base64'), AAD), { maxOutputLength: MAX_UNPACKED });
		return JSON.parse(json.toString('utf8'));
	} catch (e) {
		// a forged backup (key chosen by the uploader) must not unpack into gigabytes
		if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new Error('backup.invalidFile');
		throw new Error('backup.wrongKey');
	}
}

/** Locale (or language) from the (encrypted) settings in the backup; English if none is stored. */
export function backupLocale(data: BackupData, dek: Buffer): string {
	if (!data.meta.settings) return DEFAULT_LANG;
	const s = decryptJson<{ language?: string; locale?: string }>(dek, Buffer.from(data.meta.settings, 'base64'), SETTINGS_AAD);
	if (isLocale(s.locale) && s.locale.slice(0, 2) === s.language) return s.locale;
	return isLang(s.language) ? s.language : DEFAULT_LANG;
}

const entryRows = (data: BackupData) => data.entries.map((o) => jsonToRow(o) as unknown as EntryRow);

/** Number of locked entries in the backup (without completely cleared ones). */
export function lockedCount(data: BackupData): number {
	return entryRows(data).filter((r) => r.locked === 1 && r.empty !== 1).length;
}

/** Checks the PIN and returns the lock key; null for a wrong PIN or if the backup has no PIN. */
export function unlockBackupPin(data: BackupData, dek: Buffer, pin: string): Promise<Buffer | null> {
	const { pin_kdf: kdf, pin_check: check } = data.meta;
	return kdf && check ? unlockWithPin(dek, pin, kdf, check) : Promise.resolve(null);
}

/**
 * Decrypted entries from a backup, oldest first – like `readableEntries` (backup.ts) in the app.
 * Locked entries only with the lock key, otherwise they count towards `skippedLocked`. Completely cleared ones are left out.
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
		const content = decryptContent(key, r.payload, r.id, r.revision);
		// backups before format version 2 don't have the column "empty"
		if (r.empty === undefined && isEmptyContent(content)) continue;
		entries.push({ ...toMeta(r), content });
	}
	return { entries, skippedLocked };
}
