import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import {
	defaultKdfParams,
	encryptJson,
	entryAad,
	generateKey,
	lockKeyFromPin,
	pinCheck,
	SETTINGS_AAD
} from '../src/lib/server/crypto.ts';
import {
	backupEntries,
	backupLanguage,
	encodeBackup,
	lockedCount,
	parseBackupHeader,
	readBackup,
	rowsToJson,
	unlockBackupPin,
	type BackupData
} from '../src/lib/server/backup-file.ts';
import { exportJson, exportMarkdown, formatEntries } from '../src/lib/server/export.ts';
import { exportPdf, FONT_FILES } from '../src/lib/server/pdf/pdf.ts';
import { translate } from '../src/lib/i18n/index.ts';
import type { Entry, EntryContent } from '../src/lib/types.ts';

const t = (key: string) => translate('de', key);

const entry = (date: string, content: EntryContent): Entry => ({
	id: date,
	date,
	kinds: [],
	locked: false,
	aiAllowed: true,
	revision: 1,
	createdAt: '',
	updatedAt: '',
	content
});

const full: EntryContent = {
	mood: 4,
	sections: {
		erlebt: { gratitude: ['Kaffee', '', ' Sonne '], experienced: '# Kein Titel\nZweite Zeile', highlight: '', takeaway: '' },
		gefuehl: { energy: 3, emotions: ['joy', 'tired'] }
	},
	free: ' Frei '
};

describe('Markdown', () => {
	test('Aufbau wie bisher (KI-Datei und Export): Datum, Stimmung, Abschnitte, Felder, freie Gedanken', () => {
		const expected = [
			'### Freitag, 16. Oktober 2026',
			'Stimmung: 4/5 (gut)',
			`**${t('section.erlebt.title')}**`,
			`- ${t('section.erlebt.gratitude')}: Kaffee; Sonne`,
			`- ${t('section.erlebt.experienced')}: \\# Kein Titel\nZweite Zeile`,
			`**${t('section.gefuehl.title')}**`,
			`- ${t('section.gefuehl.energy')}: 3/5`,
			`- ${t('section.gefuehl.emotions')}: Freude; Müdigkeit`,
			'**Freie Gedanken**',
			'Frei'
		].join('\n');
		assert.equal(formatEntries([entry('2026-10-16', full)], 'de'), expected);
	});

	test('Export: Titel, Tage als ##, gesperrte (ohne Inhalt) fehlen', () => {
		const md = exportMarkdown([entry('2026-10-15', { mood: null, sections: {}, free: 'A' }), { ...entry('2026-10-16', full), content: null }], 'en');
		assert.match(md, /^# ediurnum – Journal\n\n## Thursday, 15 October 2026\n\*\*Free thoughts\*\*\nA\n$/);
	});

	test('JSON enthält Einträge und Anzahl ausgelassener gesperrter', () => {
		const json = JSON.parse(exportJson([entry('2026-10-16', full)], 2));
		assert.equal(json.format, 'ediurnum-plain');
		assert.equal(json.skippedLocked, 2);
		assert.deepEqual(json.entries[0].content, full);
	});
});

describe('PDF', () => {
	const dir = new URL('../src/lib/server/pdf/fonts/', import.meta.url);
	const fonts = Object.fromEntries(Object.values(FONT_FILES).flat().map((f) => [f, readFileSync(new URL(f, dir))]));

	test('Gültiges PDF mit Titel, Sprache und mehreren Seiten bei vielen Einträgen', async () => {
		const many = Array.from({ length: 40 }, (_, i) => entry(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, full));
		const bytes = await exportPdf(many, 'de', 1, fonts);
		assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
		const pdf = await PDFDocument.load(bytes);
		assert.ok(pdf.getPageCount() > 3, `${pdf.getPageCount()} Seiten`);
		assert.equal(pdf.getTitle(), 'ediurnum – Tagebuch');
		assert.ok(!Buffer.from(bytes).includes('Kaffee'), 'Text nur als Glyphen der eingebetteten Schrift');
	});

	test('Überlange Wörter, Emojis, Zeichen aus Latin Extended und leere Exporte gehen', async () => {
		const odd: EntryContent = { mood: 1, sections: {}, free: 'x'.repeat(400) + ' 🌻 ŝ ő\r\n\n\tEnde' };
		assert.equal((await PDFDocument.load(await exportPdf([entry('2026-10-16', odd)], 'en', 0, fonts))).getPageCount(), 1);
		assert.equal((await PDFDocument.load(await exportPdf([], 'de', 0, fonts))).getPageCount(), 1);
	});
});

describe('Backup lesen (auch für das Konverter-Skript)', async () => {
	const dek = generateKey();
	const params = { ...defaultKdfParams(), memory: 8192 };
	const lockKey = await lockKeyFromPin(dek, '1234', params);
	const row = (id: string, date: string, content: EntryContent, extra: Record<string, unknown> = {}) => ({
		id,
		date,
		kinds: 'erlebt',
		locked: 0,
		ai_allowed: 1,
		empty: 0,
		revision: 2,
		rev_started_at: '',
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-02T00:00:00Z',
		payload: encryptJson(extra.locked ? lockKey : dek, content, entryAad(id, 2)),
		...extra
	});
	const empty = { mood: null, sections: {}, free: '' };
	const data: BackupData = {
		meta: {
			settings: encryptJson(dek, { language: 'en' }, SETTINGS_AAD).toString('base64'),
			pin_kdf: JSON.stringify(params),
			pin_check: pinCheck(lockKey)
		},
		entries: rowsToJson([
			row('b', '2026-03-02', full),
			row('a', '2026-03-01', { ...full, free: 'erster' }),
			row('c', '2026-03-03', { ...full, free: 'gesperrt' }, { locked: 1 }),
			row('d', '2026-03-04', empty, { empty: 1 }),
			row('e', '2026-03-05', empty, { empty: undefined }) // Format-Version 1 kennt "empty" nicht
		]),
		revisions: [],
		analyses: []
	};
	const text = encodeBackup(dek, data, '1.0.0');

	test('Kopf ohne Schlüssel lesbar, enthält keinen Klartext', () => {
		const header = parseBackupHeader(text);
		assert.equal(header.appVersion, '1.0.0');
		assert.ok(!text.includes('erster'));
		assert.throws(() => parseBackupHeader('kein json'), /backup.invalidFile/);
		assert.throws(() => parseBackupHeader(JSON.stringify({ ...header, version: 99 })), /backup.tooNew/);
	});

	test('Falscher Schlüssel wird erkannt', () => {
		assert.throws(() => readBackup(text, generateKey()), /backup.wrongKey/);
	});

	test('Einträge ältester zuerst; gesperrte nur mit PIN; geleerte fehlen', async () => {
		const read = readBackup(text, dek);
		assert.equal(backupLanguage(read, dek), 'en');
		assert.equal(lockedCount(read), 1);

		const without = backupEntries(read, dek, null);
		assert.deepEqual(without.entries.map((e) => e.date), ['2026-03-01', '2026-03-02']);
		assert.equal(without.skippedLocked, 1);
		assert.equal(without.entries[0].content?.free, 'erster');
		assert.deepEqual(without.entries[0].kinds, ['erlebt']);

		assert.equal(await unlockBackupPin(read, dek, '9999'), null);
		const key = await unlockBackupPin(read, dek, '1234');
		assert.ok(key);
		const withPin = backupEntries(read, dek, key);
		assert.deepEqual(withPin.entries.map((e) => [e.date, e.locked]), [['2026-03-01', false], ['2026-03-02', false], ['2026-03-03', true]]);
		assert.equal(withPin.skippedLocked, 0);
	});
});
