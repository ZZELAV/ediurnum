/**
 * Konverter: macht aus einem verschlüsselten Backup (.ediurnum) eine lesbare Datei (Markdown, JSON oder PDF) –
 * ohne laufende App, z. B. als Notfallzugriff. Fragt alles interaktiv ab; Schlüssel und PIN werden unsichtbar
 * eingegeben und nie als Argument übergeben oder gespeichert.
 *
 *   npm run convert [-- backup.ediurnum]
 *   docker run --rm -it -v "$PWD:/work" -u "$(id -u):$(id -g)" zzelav/ediurnum node scripts/convert.ts /work/backup.ediurnum
 *
 * Fragen und Meldungen immer auf Englisch; der Export selbst in der Sprache der Einstellungen im Backup.
 * Nutzt dieselben Module wie die App (backup-file.ts, export.ts, pdf/pdf.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseRecoveryKey } from '#lib/server/crypto.ts';
import {
	backupEntries,
	backupLanguage,
	lockedCount,
	parseBackupHeader,
	readBackup,
	unlockBackupPin,
	type BackupData,
	type BackupHeader
} from '#lib/server/backup-file.ts';
import { exportJson, exportMarkdown } from '#lib/server/export.ts';
import { exportPdf, FONT_FILES } from '#lib/server/pdf/pdf.ts';
import { translate } from '#lib/i18n/index.ts';
import { todayIso } from '#lib/dates.ts';

/** Texte des Skripts (nur Englisch). Meldungen, die auch die App kennt (z. B. `backup.wrongKey`), kommen aus der i18n. */
const T = {
	title: 'ediurnum – convert a backup',
	intro: 'Turns an encrypted backup (.ediurnum) into a readable file: Markdown, JSON or PDF. Cancel with Ctrl+C.',
	file: 'Backup file: ',
	fileMissing: (path: string) => `File not found: ${path}`,
	backupInfo: (date: string, version: string) => `Backup from ${date} (ediurnum ${version})`,
	key: 'Recovery key (input hidden): ',
	locked: (n: number) => (n === 1 ? '1 entry is locked.' : `${n} entries are locked.`),
	pin: 'PIN (input hidden; leave empty to skip locked entries): ',
	pinWrong: 'Wrong PIN.',
	format: 'Format – 1 Markdown, 2 JSON, 3 PDF [1]: ',
	output: (path: string) => `Output file [${path}]: `,
	overwrite: 'The file already exists. Overwrite? (y/N) ',
	done: (n: number, path: string) => `${n === 1 ? '1 entry' : `${n} entries`} saved: ${path}`,
	warning: 'Caution: this file is not encrypted. Keep it safe and delete it when you no longer need it.',
	tooManyTries: 'Too many failed attempts – cancelled.',
	cancelled: 'Cancelled.'
};
const t = (key: string, params?: Record<string, string | number>) => translate('en', key, params);
const MAX_TRIES = 3;

function cancel(): never {
	console.log('\n' + T.cancelled);
	process.exit(130);
}
process.on('SIGINT', cancel);

// Eine einzige Eingabe für alle Fragen (bei umgeleiteter Eingabe gehen so keine Zeilen verloren). Das Terminal
// bleibt im normalen Zeilenmodus und zeigt die Eingabe selbst an – ausser bei verdeckten Fragen (siehe ask).
const tty = process.stdin.isTTY === true;
const rl = createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
/** Ctrl+C im Rohmodus (dort löst es kein SIGINT aus) */
const onRawData = (chunk: Buffer) => chunk.includes(3) && cancel();

/**
 * Verdeckt: Rohmodus, damit das Terminal die Tasten nicht anzeigt. Dann kommen Steuerzeichen mit,
 * die Rücktaste wird hier ausgewertet.
 */
async function ask(question: string, hidden = false): Promise<string> {
	process.stdout.write(question);
	const raw = hidden && tty;
	if (raw) {
		process.stdin.setRawMode(true);
		process.stdin.on('data', onRawData);
	}
	const { value, done } = await lines.next();
	if (raw) {
		process.stdin.off('data', onRawData);
		process.stdin.setRawMode(false);
		process.stdout.write('\n');
	}
	if (done) cancel();
	const chars: string[] = [];
	for (const ch of String(value)) {
		if (ch === '\x7f' || ch === '\b') chars.pop();
		else if (ch >= ' ') chars.push(ch);
	}
	return chars.join('').trim();
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

/** Fehlercodes aus den Modulen (z. B. `backup.wrongKey`) als Text */
const message = (err: unknown) => (err instanceof Error && /^[a-z]+\.[A-Za-z]+$/.test(err.message) ? t(err.message) : String(err));

console.log(`${T.title}\n${T.intro}\n`);

// 1. Backup-Datei
const file = resolve(process.argv[2] || (await ask(T.file)));
if (!existsSync(file)) fail(T.fileMissing(file));
const text = readFileSync(file, 'utf8');
let header: BackupHeader;
try {
	header = parseBackupHeader(text);
} catch (err) {
	fail(message(err));
}
const createdAt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' });
console.log(T.backupInfo(createdAt.format(new Date(header.createdAt)), header.appVersion));

// 2. Wiederherstellungsschlüssel
async function unlockBackup(): Promise<{ dek: Buffer; data: BackupData }> {
	for (let i = 0; i < MAX_TRIES; i++) {
		try {
			const dek = parseRecoveryKey(await ask(T.key, true));
			return { dek, data: readBackup(text, dek) };
		} catch (err) {
			console.log(message(err));
		}
	}
	return fail(T.tooManyTries);
}
const { dek, data } = await unlockBackup();

// 3. PIN für gesperrte Einträge (optional)
let lockKey: Buffer | null = null;
const locked = lockedCount(data);
if (locked && data.meta.pin_kdf) {
	console.log(T.locked(locked));
	for (let i = 0; ; i++) {
		if (i === MAX_TRIES) fail(T.tooManyTries);
		const pin = await ask(T.pin, true);
		if (!pin) break; // leer: gesperrte Einträge auslassen
		lockKey = await unlockBackupPin(data, dek, pin);
		if (lockKey) break;
		console.log(T.pinWrong);
	}
}

// 4. Format und Ausgabedatei (Standard: neben dem Backup)
const choice = await ask(T.format);
const format = choice === '2' ? 'json' : choice === '3' ? 'pdf' : 'md';
const suggested = join(dirname(file), `ediurnum-export-${todayIso()}.${format}`);
const target = resolve((await ask(T.output(suggested))) || suggested);
if (existsSync(target) && (await ask(T.overwrite)).toLowerCase() !== 'y') fail(T.cancelled);

// 5. Umwandeln und speichern (nur für den eigenen Benutzer lesbar)
const lang = backupLanguage(data, dek);
const { entries, skippedLocked } = backupEntries(data, dek, lockKey);
let body: string | Uint8Array;
if (format === 'pdf') {
	const dir = new URL('../src/lib/server/pdf/fonts/', import.meta.url);
	const fonts = Object.fromEntries(Object.values(FONT_FILES).flat().map((f) => [f, readFileSync(new URL(f, dir))]));
	body = await exportPdf(entries, lang, skippedLocked, fonts);
} else body = format === 'json' ? exportJson(entries, skippedLocked) : exportMarkdown(entries, lang);
writeFileSync(target, body, { mode: 0o600 });
dek.fill(0);
lockKey?.fill(0);

console.log('\n' + T.done(entries.length, target));
if (skippedLocked) console.log(t('export.skippedLocked', { count: skippedLocked }));
console.log(T.warning);
rl.close();
