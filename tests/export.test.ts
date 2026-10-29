import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import {
	defaultKdfParams,
	encrypt,
	encryptJson,
	entryAad,
	generateKey,
	lockKeyFromPin,
	pinCheck,
	SETTINGS_AAD
} from '../src/lib/server/crypto.ts';
import {
	backupEntries,
	backupLocale,
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
		daily: { gratitude: ['Kaffee', '', ' Sonne '], experienced: '# Kein Titel\nZweite Zeile', highlight: '', takeaway: '' },
		feelings: { energy: 3, emotions: ['joy', 'tired'] }
	},
	free: ' Frei '
};

describe('Markdown', () => {
	test('layout as before (AI file and export): date, mood, sections, fields, free thoughts', () => {
		const expected = [
			'### Freitag, 16. Oktober 2026',
			'Stimmung: 4/5 (gut)',
			`**${t('section.daily.title')}**`,
			`- ${t('section.daily.gratitude')}: Kaffee; Sonne`,
			`- ${t('section.daily.experienced')}: \\# Kein Titel\nZweite Zeile`,
			`**${t('section.feelings.title')}**`,
			`- ${t('entry.energy')}: 3/5 (${t('energy.3')})`,
			`- ${t('section.feelings.emotions')}: Freude; Müdigkeit`,
			'**Freie Gedanken**',
			'Frei'
		].join('\n');
		assert.equal(formatEntries([entry('2026-10-16', full)], 'de'), expected);
	});

	test('export: title, days as ##, locked ones (without content) are left out', () => {
		const md = exportMarkdown([entry('2026-10-15', { mood: null, sections: {}, free: 'A' }), { ...entry('2026-10-16', full), content: null }], 'en');
		assert.match(md, /^# ediurnum – Journal\n\n## Thursday, October 15, 2026\n\*\*Free thoughts\*\*\nA\n$/);
	});

	test('JSON contains the entries and the number of skipped locked ones', () => {
		const json = JSON.parse(exportJson([entry('2026-10-16', full)], 2));
		assert.equal(json.format, 'ediurnum-plain');
		assert.equal(json.skippedLocked, 2);
		assert.deepEqual(json.entries[0].content, full);
	});
});

describe('PDF', () => {
	const dir = new URL('../src/lib/server/pdf/fonts/', import.meta.url);
	const fonts = Object.fromEntries(Object.values(FONT_FILES).flat().map((f) => [f, readFileSync(new URL(f, dir))]));

	test('valid PDF with title, language and several pages for many entries', async () => {
		const many = Array.from({ length: 40 }, (_, i) => entry(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, full));
		const bytes = await exportPdf(many, 'de', 1, fonts);
		assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
		const pdf = await PDFDocument.load(bytes);
		assert.ok(pdf.getPageCount() > 3, `${pdf.getPageCount()} pages`);
		assert.equal(pdf.getTitle(), 'ediurnum – Tagebuch');
		assert.ok(!Buffer.from(bytes).includes('Kaffee'), 'text only as glyphs of the embedded font');
	});

	test('overlong words, emojis, Latin Extended characters and empty exports work', async () => {
		const odd: EntryContent = { mood: 1, sections: {}, free: 'x'.repeat(400) + ' 🌻 ŝ ő\r\n\n\tEnde' };
		assert.equal((await PDFDocument.load(await exportPdf([entry('2026-10-16', odd)], 'en', 0, fonts))).getPageCount(), 1);
		assert.equal((await PDFDocument.load(await exportPdf([], 'de', 0, fonts))).getPageCount(), 1);
	});

	test('overlong words are split quickly and other requests keep running meanwhile', async () => {
		// splitting character by character took minutes for this (several seconds per word)
		const long: EntryContent = { mood: 3, sections: {}, free: 'y'.repeat(1500) };
		const many = Array.from({ length: 40 }, (_, i) => entry(`2026-02-${String((i % 28) + 1).padStart(2, '0')}`, long));
		let ticks = 0;
		const timer = setInterval(() => ticks++, 5);
		const started = performance.now();
		const pdf = await PDFDocument.load(await exportPdf(many, 'en', 0, fonts));
		clearInterval(timer);
		assert.ok(performance.now() - started < 15_000, `${Math.round(performance.now() - started)} ms`);
		assert.ok(pdf.getPageCount() > 10, `${pdf.getPageCount()} pages`);
		assert.ok(ticks > 1, 'the event loop was free in between');
	});
});

describe('Reading backups (also for the converter script)', async () => {
	const dek = generateKey();
	const params = { ...defaultKdfParams(), memory: 8192 };
	const lockKey = await lockKeyFromPin(dek, '1234', params);
	const row = (id: string, date: string, content: EntryContent, extra: Record<string, unknown> = {}) => ({
		id,
		date,
		kinds: 'daily',
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
			row('e', '2026-03-05', empty, { empty: undefined }) // format version 1 doesn't know "empty"
		]),
		revisions: [],
		analyses: []
	};
	const text = encodeBackup(dek, data, '1.0.0');

	test('header readable without a key, contains no plain text', () => {
		const header = parseBackupHeader(text);
		assert.equal(header.appVersion, '1.0.0');
		assert.ok(!text.includes('erster'));
		assert.throws(() => parseBackupHeader('kein json'), /backup.invalidFile/);
		assert.throws(() => parseBackupHeader(JSON.stringify({ ...header, version: 99 })), /backup.tooNew/);
	});

	test('a wrong key is detected', () => {
		assert.throws(() => readBackup(text, generateKey()), /backup.wrongKey/);
	});

	test('a forged backup that unpacks into too much is rejected (before setup anyone may upload one)', () => {
		// 20 gzip members of 16 MiB zeros each: a few hundred KB packed, 320 MiB unpacked
		const bomb = Buffer.concat(Array(20).fill(gzipSync(Buffer.alloc(16 * 1024 * 1024))));
		const header = { ...parseBackupHeader(text), data: encrypt(dek, bomb, 'ediurnum/backup/v1').toString('base64') };
		assert.throws(() => readBackup(JSON.stringify(header), dek), /backup.invalidFile/);
	});

	test('entries oldest first; locked ones only with the PIN; cleared ones are left out', async () => {
		const read = readBackup(text, dek);
		assert.equal(backupLocale(read, dek), 'en');
		assert.equal(lockedCount(read), 1);

		const without = backupEntries(read, dek, null);
		assert.deepEqual(without.entries.map((e) => e.date), ['2026-03-01', '2026-03-02']);
		assert.equal(without.skippedLocked, 1);
		assert.equal(without.entries[0].content?.free, 'erster');
		assert.deepEqual(without.entries[0].kinds, ['daily']);

		assert.equal(await unlockBackupPin(read, dek, '9999'), null);
		const key = await unlockBackupPin(read, dek, '1234');
		assert.ok(key);
		const withPin = backupEntries(read, dek, key);
		assert.deepEqual(withPin.entries.map((e) => [e.date, e.locked]), [['2026-03-01', false], ['2026-03-02', false], ['2026-03-03', true]]);
		assert.equal(withPin.skippedLocked, 0);
	});

	test('backups up to format version 2 with legacy section kinds read like current ones', async () => {
		const legacyContent = {
			...full,
			sections: { erlebt: full.sections.daily, gefuehl: full.sections.feelings, wachstum: { learned: 'Neu' } }
		} as unknown as EntryContent;
		const current = { ...full, sections: { ...full.sections, growth: { learned: 'Neu' } } };
		const legacy: BackupData = {
			...data,
			entries: rowsToJson([
				row('a', '2026-03-01', legacyContent, { kinds: 'erlebt,gefuehl,wachstum' }),
				row('c', '2026-03-03', legacyContent, { kinds: 'gefuehl', locked: 1 })
			])
		};
		const read = readBackup(JSON.stringify({ ...JSON.parse(encodeBackup(dek, legacy, '1.0.0')), version: 2 }), dek);
		const { entries } = backupEntries(read, dek, await unlockBackupPin(read, dek, '1234'));
		assert.deepEqual(entries.map((e) => e.kinds), [['daily', 'feelings', 'growth'], ['feelings']]);
		for (const e of entries) assert.deepEqual(e.content, current);
		// same Markdown as from an entry in the current format
		assert.equal(exportMarkdown(entries.slice(0, 1), 'de'), exportMarkdown([{ ...entries[0], content: current }], 'de'));
		assert.match(exportMarkdown(entries, 'de'), /Neu erlernt/);
	});
});
