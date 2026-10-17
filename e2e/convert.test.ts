/**
 * PDF export of the app and the converter script (scripts/convert.ts) with a real backup from the server.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, PIN, setupJournal, startServer, zurichToday, type TestServer } from './helpers.ts';

let server: TestServer;
let c: Client;
let recoveryKey: string;
let dir: string;
let backupFile: string;

before(async () => {
	server = await startServer();
	({ client: c, recoveryKey } = await setupJournal(server));
	await c.api('/api/entry/2026-05-01', { content: { mood: 4, sections: { daily: { gratitude: ['Kaffee im Café', '', ''] } }, free: 'Offen lesbar' } });
	await c.api('/api/entry/2026-05-02', { content: { mood: 2, sections: {}, free: 'Geheim mit PIN' } });
	await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
	await c.api('/api/entry/2026-05-02/lock', { locked: true });
	await c.api('/api/pin', undefined, 'DELETE');
	dir = mkdtempSync(join(tmpdir(), 'ediurnum-convert-'));
	backupFile = join(dir, 'backup.ediurnum');
	writeFileSync(backupFile, await (await c.get('/api/export/backup')).text());
});
after(async () => {
	await server.stop();
	rmSync(dir, { recursive: true, force: true });
});

/** Runs the script with answers to the questions (one per line) */
function convert(answers: string[], args = [backupFile]) {
	const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/convert.ts', ...args], {
		input: answers.join('\n') + '\n',
		encoding: 'utf8',
		env: { ...process.env, LANG: 'de_CH.UTF-8', TZ: 'Europe/Zurich' } // questions in English anyway
	});
	return { code: r.status, out: r.stdout + r.stderr };
}

const outFile = (ext: string) => join(dir, `ediurnum-export-${zurichToday()}.${ext}`);

describe('PDF export in the app', () => {
	test('returns a PDF to download, without plain text', async () => {
		const res = await c.get('/api/export/plain?format=pdf');
		assert.equal(res.status, 200);
		assert.equal(res.headers.get('content-type'), 'application/pdf');
		assert.match(res.headers.get('content-disposition')!, /attachment; filename="ediurnum-export-\d{4}-\d\d-\d\d\.pdf"/);
		const bytes = Buffer.from(await res.arrayBuffer());
		assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
		assert.ok(!bytes.includes('Offen lesbar'), 'text only as glyphs of the embedded font');
		await server.waitForOutput(/readable export downloaded format=pdf skippedLocked=1/);
	});
});

describe('Converter script', () => {
	test('Markdown without PIN is identical to the export of the app', async () => {
		const r = convert([recoveryKey, '', '1', '']);
		assert.equal(r.code, 0, r.out);
		assert.match(r.out, /1 entry saved/);
		assert.match(r.out, /1 locked entry is not included/);
		assert.match(r.out, /not encrypted/);
		assert.doesNotMatch(r.out, new RegExp(recoveryKey), 'the key does not appear in the output');
		const app = await (await c.get('/api/export/plain?format=md')).text();
		assert.equal(readFileSync(outFile('md'), 'utf8'), app);
		if (process.platform !== 'win32') assert.equal(statSync(outFile('md')).mode & 0o777, 0o600);
	});

	test('with PIN also locked entries; JSON structured as in the app', () => {
		const r = convert([recoveryKey, '000000', PIN, '2', '']);
		assert.equal(r.code, 0, r.out);
		assert.match(r.out, /Wrong PIN/);
		const json = JSON.parse(readFileSync(outFile('json'), 'utf8'));
		assert.equal(json.format, 'ediurnum-plain');
		assert.equal(json.skippedLocked, 0);
		assert.deepEqual(
			json.entries.map((e: { date: string; locked: boolean; content: { free: string } }) => [e.date, e.locked, e.content.free]),
			[['2026-05-01', false, 'Offen lesbar'], ['2026-05-02', true, 'Geheim mit PIN']]
		);
	});

	test('PDF with its own file name', () => {
		const target = join(dir, 'tagebuch.pdf');
		const r = convert([recoveryKey, PIN, '3', target]);
		assert.equal(r.code, 0, r.out);
		assert.equal(readFileSync(target).subarray(0, 5).toString(), '%PDF-');
	});

	test('an existing file is only overwritten after asking', () => {
		const before = readFileSync(outFile('md'), 'utf8');
		const r = convert([recoveryKey, '', '1', '', 'n']);
		assert.equal(r.code, 1);
		assert.match(r.out, /Overwrite\?/);
		assert.match(r.out, /Cancelled/);
		assert.equal(readFileSync(outFile('md'), 'utf8'), before);
	});

	test('wrong key, typos and a missing file are reported', () => {
		const wrong = convert(['ABCD-EFGH', recoveryKey.replace(/^.{4}/, 'ZZZZ'), recoveryKey.slice(0, -1) + (recoveryKey.endsWith('A') ? 'B' : 'A')]);
		assert.equal(wrong.code, 1);
		assert.match(wrong.out, /does not have the right length/);
		assert.match(wrong.out, /Too many failed attempts/);
		const missing = convert([], [join(dir, 'gibt-es-nicht.ediurnum')]);
		assert.equal(missing.code, 1);
		assert.match(missing.out, /File not found/);
		assert.ok(!existsSync(join(dir, 'gibt-es-nicht.md')));
	});
});
