/**
 * Migration to English section kinds (schema 3 → 4, backup format 2 → 3).
 *
 * Builds a journal with the current version, turns its database into the 1.0.0 format (legacy names in the
 * plain-text parts and inside the encrypted contents of entries and revisions, also locked ones) and checks that
 * the current version migrates, reads and rewrites everything correctly – from the database and from a backup.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decryptJson, encryptJson, entryAad, parseRecoveryKey, unlockWithPin } from '../src/lib/server/crypto.ts';
import { encodeBackup, readBackup, rowsToJson } from '../src/lib/server/backup-file.ts';
import { Client, PASSWORD, PIN, setupJournal, startServer, zurichToday, type TestServer } from './helpers.ts';

type Content = { mood: number | null; sections: Record<string, Record<string, unknown>>; free: string };

const LEGACY: Record<string, string> = { daily: 'erlebt', feelings: 'gefuehl', growth: 'wachstum' };

const daily = (experienced: string) => ({ gratitude: ['Kaffee', '', ''], experienced, highlight: '', takeaway: '' });
const feelings = (energy: number, emotions: string[], energizers: string) => ({
	energy,
	emotions,
	energizers,
	drainers: '',
	onMyMind: ''
});
const growth = (learned: string) => ({ learned, proud: '', growth: 'Geduld', nextFocus: '' });

// Monday 7.9. and Wednesday 16.9.2026 are in different weeks
const ENTRIES: Record<string, Content> = {
	'2026-09-07': { mood: 4, sections: { daily: daily('Wanderung'), feelings: feelings(4, ['joy', 'tired'], 'Wandern am See') }, free: 'Frei' },
	'2026-09-08': { mood: 3, sections: { daily: daily('Zweite Fassung') }, free: '' },
	'2026-09-16': { mood: 2, sections: { daily: daily('Gesperrt'), feelings: feelings(2, ['calm'], 'Ruhe') }, free: '' },
	'2026-09-30': { mood: 5, sections: { daily: daily('Monatsende'), growth: growth('Svelte Runes') }, free: '' }
};
const LOCKED = '2026-09-16';
const KINDS: Record<string, string> = {
	'2026-09-07': 'daily,feelings',
	'2026-09-08': 'daily',
	'2026-09-16': 'daily,feelings',
	'2026-09-30': 'daily,growth'
};
const FIRST_VERSION = { mood: 3, sections: { daily: daily('Erste Fassung') }, free: '' };

const rename = (sections: Record<string, unknown>, map: Record<string, string>) =>
	Object.fromEntries(Object.entries(sections).map(([k, v]) => [map[k] ?? k, v]));

let source: TestServer;
let recoveryKey: string;
let dek: Buffer;
let lockKey: Buffer;
let reminders: Record<string, unknown>;
let legacyBackup: string;

const dbFile = (s: TestServer) => join(s.dataDir, 'ediurnum.db');
const meta = (db: DatabaseSync, key: string) =>
	(db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;

/** Decrypted content as stored (without any conversion) */
function rawContent(db: DatabaseSync, date: string, revision?: number): Content {
	const e = db.prepare('SELECT id, revision, locked, payload FROM entries WHERE date = ?').get(date) as {
		id: string;
		revision: number;
		locked: number;
		payload: Uint8Array;
	};
	const rev = revision ?? e.revision;
	const row =
		revision === undefined
			? e
			: (db.prepare('SELECT locked, payload FROM entry_revisions WHERE entry_id = ? AND revision = ?').get(e.id, rev) as {
					locked: number;
					payload: Uint8Array;
				});
	return decryptJson<Content>(row.locked ? lockKey : dek, row.payload, entryAad(e.id, rev));
}

/** Turns the database into the 1.0.0 format: legacy section kinds everywhere, schema 3 */
function toLegacyFormat(file: string) {
	const db = new DatabaseSync(file);
	const toLegacy = (key: Buffer, payload: Uint8Array, aad: string) => {
		const c = decryptJson<Content>(key, payload, aad);
		return encryptJson(key, { ...c, sections: rename(c.sections, LEGACY) }, aad);
	};
	const entries = db.prepare('SELECT id, revision, locked, kinds, payload FROM entries').all() as {
		id: string;
		revision: number;
		locked: number;
		kinds: string;
		payload: Uint8Array;
	}[];
	for (const e of entries) {
		const kinds = e.kinds.split(',').map((k) => LEGACY[k]).join(',');
		const payload = toLegacy(e.locked ? lockKey : dek, e.payload, entryAad(e.id, e.revision));
		db.prepare('UPDATE entries SET kinds = ?, payload = ? WHERE id = ?').run(kinds, payload, e.id);
	}
	const revisions = db.prepare('SELECT entry_id, revision, locked, payload FROM entry_revisions').all() as {
		entry_id: string;
		revision: number;
		locked: number;
		payload: Uint8Array;
	}[];
	for (const r of revisions) {
		const payload = toLegacy(r.locked ? lockKey : dek, r.payload, entryAad(r.entry_id, r.revision));
		db.prepare('UPDATE entry_revisions SET payload = ? WHERE entry_id = ? AND revision = ?').run(payload, r.entry_id, r.revision);
	}
	const cfg = JSON.parse(meta(db, 'reminders')!);
	db.prepare(`UPDATE meta SET value = ? WHERE key = 'reminders'`).run(JSON.stringify(rename(cfg, LEGACY)));
	db.prepare(`UPDATE meta SET key = 'reminder_sent_gefuehl' WHERE key = 'reminder_sent_feelings'`).run();
	db.prepare(`UPDATE meta SET value = '3' WHERE key = 'schema'`).run();
	db.close();
}

/** Backup as 1.0.0 wrote it (format version 2) from a database in the 1.0.0 format */
function legacyBackupOf(file: string): string {
	const db = new DatabaseSync(file, { readOnly: true });
	const m: Record<string, string> = {};
	for (const k of ['created_at', 'settings', 'profile', 'pin_kdf', 'pin_check', 'reminders']) {
		const v = meta(db, k);
		if (v !== null) m[k] = v;
	}
	const all = (table: string) => rowsToJson(db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]);
	const data = { meta: m, entries: all('entries'), revisions: all('entry_revisions'), analyses: all('analyses') };
	db.close();
	return JSON.stringify({ ...JSON.parse(encodeBackup(dek, data, '1.0.0')), version: 2 });
}

before(async () => {
	source = await startServer();
	const r = await setupJournal(source);
	recoveryKey = r.recoveryKey;
	dek = parseRecoveryKey(recoveryKey);
	const c = r.client;
	await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
	await c.api('/api/entry/2026-09-08', { content: FIRST_VERSION });
	// the next save of 8.9. happens "on a later day" → version 1 is archived
	let db = new DatabaseSync(dbFile(source));
	db.prepare(`UPDATE entries SET rev_started_at = '2020-01-01T12:00:00.000Z'`).run();
	db.close();
	for (const [date, content] of Object.entries(ENTRIES)) await c.api(`/api/entry/${date}`, { content });
	await c.api('/api/pin', { pin: PIN });
	await c.api(`/api/entry/${LOCKED}/lock`, { locked: true });
	// review schedule with today's weekday and 00:00 → marked as sent today
	const weekday = new Date(zurichToday() + 'T00:00:00Z').getUTCDay();
	await c.action('/reminders?/reviews', {
		feelingsEnabled: 'on',
		feelingsWeekday: String(weekday),
		feelingsTime: '00:00',
		growthEnabled: 'on',
		growthDay: '15',
		growthTime: '20:30'
	});
	await source.stop({ keepData: true });

	db = new DatabaseSync(dbFile(source));
	lockKey = (await unlockWithPin(dek, PIN, meta(db, 'pin_kdf')!, meta(db, 'pin_check')!))!;
	reminders = JSON.parse(meta(db, 'reminders')!);
	assert.ok(meta(db, 'reminder_sent_feelings'), 'precondition: review marked as sent');
	assert.equal(rawContent(db, '2026-09-08', 1).sections.daily.experienced, 'Erste Fassung', 'precondition: revision 1');
	db.close();

	toLegacyFormat(dbFile(source));
	legacyBackup = legacyBackupOf(dbFile(source));
});
after(() => source?.stop());

describe('Database in the 1.0.0 format (schema 3, legacy section kinds)', () => {
	let server: TestServer;
	let c: Client;
	let db: DatabaseSync;
	before(async () => {
		// precondition: really in the old format, also inside the encrypted contents
		db = new DatabaseSync(dbFile(source));
		assert.equal(meta(db, 'schema'), '3');
		assert.deepEqual(Object.keys(rawContent(db, '2026-09-07').sections), ['erlebt', 'gefuehl']);
		assert.deepEqual(Object.keys(rawContent(db, LOCKED).sections), ['erlebt', 'gefuehl']);
		assert.deepEqual(Object.keys(rawContent(db, '2026-09-08', 1).sections), ['erlebt']);
		db.close();

		server = await startServer({}, { dataDir: source.dataDir });
		db = new DatabaseSync(dbFile(server));
		c = new Client(server.url);
		assert.equal((await c.action('/login', { password: PASSWORD })).location, '/');
	});
	after(async () => {
		db.close();
		await server.stop({ keepData: true });
	});

	test('start migrates the plain-text parts to schema 4', () => {
		assert.equal(meta(db, 'schema'), '4');
		const kinds = db.prepare('SELECT date, kinds FROM entries ORDER BY date').all() as { date: string; kinds: string }[];
		assert.deepEqual(Object.fromEntries(kinds.map((k) => [k.date, k.kinds])), KINDS);
		assert.deepEqual(JSON.parse(meta(db, 'reminders')!), reminders, 'schedule unchanged, keys renamed');
		assert.ok(meta(db, 'reminder_sent_feelings'), 'marker renamed');
		assert.equal(meta(db, 'reminder_sent_gefuehl'), null);
		const legacyKeys = db.prepare(`SELECT key FROM meta WHERE key LIKE '%gefuehl%' OR key LIKE '%wachstum%' OR value LIKE '%gefuehl%' OR value LIKE '%wachstum%'`).all();
		assert.deepEqual(legacyKeys, []);
		// encrypted contents are not touched on start
		assert.deepEqual(Object.keys(rawContent(db, '2026-09-07').sections), ['erlebt', 'gefuehl']);
		assert.doesNotMatch(server.output(), /ERROR/);
	});

	test('readable export shows the legacy contents with the new names', async () => {
		let r = await c.api('/api/export/plain?format=json');
		const unlocked = Object.keys(ENTRIES).filter((d) => d !== LOCKED);
		const byDate = (list: unknown) => Object.fromEntries((list as { date: string; content: Content; kinds: string[] }[]).map((e) => [e.date, e]));
		let got = byDate(r.json.entries);
		assert.deepEqual(Object.keys(got), unlocked);
		assert.equal(r.json.skippedLocked, 1);
		for (const d of unlocked) {
			assert.deepEqual(got[d].content, ENTRIES[d], d);
			assert.deepEqual(got[d].kinds, KINDS[d].split(','), d);
		}
		await c.api('/api/pin', { pin: PIN });
		r = await c.api('/api/export/plain?format=json');
		got = byDate(r.json.entries);
		assert.deepEqual(got[LOCKED].content, ENTRIES[LOCKED], 'locked entry with PIN');
		const md = await (await c.get('/api/export/plain?format=md')).text();
		for (const text of ['Wandern am See', 'Svelte Runes', 'Ruhe', 'Monatsende']) assert.match(md, new RegExp(text));
		assert.match(md, /Freude; Müdigkeit/, 'emotions translated');
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('search finds text in legacy sections and names the field with the new key', async () => {
		const r = await c.api('/api/search', { query: 'Wandern' });
		const results = r.json.results as { date: string; field: string }[];
		assert.deepEqual(results.map((x) => [x.date, x.field]), [['2026-09-07', 'section.feelings.energizers']]);
		const growthHit = (await c.api('/api/search', { query: 'Runes' })).json.results as { field: string }[];
		assert.equal(growthHit[0].field, 'section.growth.learned');
	});

	test('statistics and the archive count legacy entries', async () => {
		const html = (await (await c.get('/stats?period=all')).text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
		// two weekly reviews (one locked, counted without PIN by its kind) and one monthly review
		assert.match(html, /Wochenrückblicke 2 von \d+/);
		assert.match(html, /Monatsrückblicke 1 von \d+/);
		assert.match(html, /Ø Energie 4\.0/, 'energy from the readable weekly review');
		const archive = await (await c.get('/archive/__data.json')).text();
		assert.match(archive, /"feelings"/);
		assert.match(archive, /"growth"/);
		assert.doesNotMatch(archive, /gefuehl|wachstum|erlebt/);
		assert.match(archive, /"joy"/, 'emotions for the filter');
	});

	test('pages with legacy contents open without errors', async () => {
		for (const path of ['/', '/archive', '/stats', '/insights', '/reminders', '/entry/2026-09-07', '/entry/2026-09-08/history', `/entry/${LOCKED}`]) {
			assert.equal((await c.get(path)).status, 200, path);
		}
		const history = await (await c.get('/entry/2026-09-08/history')).text();
		assert.match(history, /Erste Fassung/, 'legacy revision shown');
		assert.match(history, /Zweite Fassung/);
		assert.doesNotMatch(server.output(), /ERROR/);
	});

	test('saving unchanged content neither writes nor creates a version', async () => {
		const before = db.prepare(`SELECT revision, updated_at, payload FROM entries WHERE date = '2026-09-07'`).get() as {
			revision: number;
			updated_at: string;
			payload: Uint8Array;
		};
		const r = await c.api('/api/entry/2026-09-07', { content: ENTRIES['2026-09-07'] });
		assert.equal(r.status, 200);
		const now = db.prepare(`SELECT revision, updated_at, payload FROM entries WHERE date = '2026-09-07'`).get() as typeof before;
		assert.equal(now.revision, before.revision);
		assert.equal(now.updated_at, before.updated_at);
		assert.deepEqual(now.payload, before.payload);
	});

	test('editing rewrites the content with the new names; older versions stay readable and restorable', async () => {
		const changed = { ...ENTRIES['2026-09-07'], free: 'Ergänzt' };
		await c.api('/api/entry/2026-09-07', { content: changed });
		assert.deepEqual(Object.keys(rawContent(db, '2026-09-07').sections), ['daily', 'feelings']);
		assert.equal(rawContent(db, '2026-09-07').free, 'Ergänzt');
		const r = await c.api('/api/entry/2026-09-08/restore', { revision: 1 });
		assert.equal(r.status, 200);
		const restored = rawContent(db, '2026-09-08');
		assert.deepEqual(restored.sections, FIRST_VERSION.sections, 'legacy revision restored with new names');
		assert.equal((db.prepare(`SELECT kinds FROM entries WHERE date = '2026-09-08'`).get() as { kinds: string }).kinds, 'daily');
	});

	test('unlocking a locked legacy entry re-encrypts it with the new names', async () => {
		await c.api('/api/pin', { pin: PIN });
		assert.equal((await c.api(`/api/entry/${LOCKED}/lock`, { locked: false })).status, 200);
		const content = rawContent(db, LOCKED);
		assert.deepEqual(content, ENTRIES[LOCKED]);
		await c.api(`/api/entry/${LOCKED}/lock`, { locked: true });
		assert.deepEqual(rawContent(db, LOCKED), ENTRIES[LOCKED]);
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('a new backup has format version 3 and only new names in the plain-text parts', async () => {
		const text = await (await c.get('/api/export/backup')).text();
		assert.equal(JSON.parse(text).version, 3);
		const data = readBackup(text, dek);
		assert.deepEqual(Object.fromEntries(data.entries.map((e) => [e.date, e.kinds])), KINDS);
		assert.deepEqual(JSON.parse(data.meta.reminders), reminders);
	});
});

describe('Second start after the migration', () => {
	test('changes nothing (idempotent)', async () => {
		let db = new DatabaseSync(dbFile(source), { readOnly: true });
		const before = db.prepare('SELECT date, kinds, revision, payload FROM entries ORDER BY date').all();
		const metaBefore = db.prepare('SELECT key, value FROM meta ORDER BY key').all();
		db.close();
		const server = await startServer({}, { dataDir: source.dataDir });
		await server.stop({ keepData: true });
		db = new DatabaseSync(dbFile(source), { readOnly: true });
		assert.deepEqual(db.prepare('SELECT date, kinds, revision, payload FROM entries ORDER BY date').all(), before);
		const metaAfter = (db.prepare('SELECT key, value FROM meta ORDER BY key').all() as { key: string; value: string }[]).filter(
			(m) => !m.key.startsWith('vapid')
		);
		assert.deepEqual(metaAfter, (metaBefore as { key: string; value: string }[]).filter((m) => !m.key.startsWith('vapid')));
		db.close();
	});
});

describe('Backup of format version 2 with legacy section kinds', () => {
	let target: TestServer;
	let c: Client;
	let db: DatabaseSync;
	before(async () => {
		assert.equal(JSON.parse(legacyBackup).version, 2);
		target = await startServer();
		c = new Client(target.url);
		const r = await c.action('/setup?/restore', {
			password: 'Passwort-Ziel-123',
			confirm: 'Passwort-Ziel-123',
			recoveryKey,
			backup: new Blob([legacyBackup])
		});
		assert.equal(r.location, '/');
		db = new DatabaseSync(dbFile(target));
	});
	after(async () => {
		db.close();
		await target.stop();
	});

	test('restore renames the kinds and the review schedule', () => {
		const kinds = db.prepare('SELECT date, kinds FROM entries ORDER BY date').all() as { date: string; kinds: string }[];
		assert.deepEqual(Object.fromEntries(kinds.map((k) => [k.date, k.kinds])), KINDS);
		assert.deepEqual(JSON.parse(meta(db, 'reminders')!), reminders);
		assert.equal(meta(db, 'schema'), '4');
	});

	test('contents, the locked entry and older versions are readable with the new names', async () => {
		await c.api('/api/pin', { pin: PIN });
		const r = await c.api('/api/export/plain?format=json');
		const entries = r.json.entries as { date: string; content: Content }[];
		assert.deepEqual(Object.fromEntries(entries.map((e) => [e.date, e.content])), ENTRIES);
		const history = await (await c.get('/entry/2026-09-08/history')).text();
		assert.match(history, /Erste Fassung/);
		assert.doesNotMatch(target.output(), /ERROR/);
	});
});
