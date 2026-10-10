/**
 * Komplett geleerte Einträge, Datenbank-Migration und Backup-Versionen.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { decrypt, encrypt, parseRecoveryKey } from '../src/lib/server/crypto.ts';
import { Client, PASSWORD, setupJournal, startServer, type TestServer } from './helpers.ts';

const filled = (text: string) => ({ mood: 3, sections: { erlebt: { gratitude: ['', '', ''], experienced: text, highlight: '', takeaway: '' } }, free: '' });
const cleared = { mood: null, sections: { erlebt: { gratitude: ['', '', ''], experienced: '', highlight: '', takeaway: '' } }, free: '' };

describe('Komplett geleerter Eintrag', () => {
	let server: TestServer;
	let c: Client;
	before(async () => {
		server = await startServer({ WIDGET_TOKEN: 'w'.repeat(32) });
		({ client: c } = await setupJournal(server));
	});
	after(() => server.stop());

	const widgetAuth = async () => {
		const r = await new Client(server.url).request('/api/widget', { headers: { authorization: 'Bearer ' + 'w'.repeat(32) } });
		return (await r.json()) as { entries: number; lastEntry: string | null };
	};

	test('zählt nicht als geschrieben, bleibt aber mit Versionen erhalten', async () => {
		await c.api('/api/entry/2026-05-01', { content: filled('Erster Text') });
		await c.api('/api/entry/2026-05-02', { content: filled('Bleibt') });
		assert.equal((await widgetAuth()).entries, 2);

		const r = await c.api('/api/entry/2026-05-01', { content: cleared });
		assert.equal(r.status, 200);
		const w = await widgetAuth();
		assert.equal(w.entries, 1, 'geleerter Eintrag zählt nicht');
		const db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
		const saved = db.prepare(`SELECT updated_at FROM entries WHERE date = '2026-05-02'`).get() as { updated_at: string };
		db.close();
		assert.equal(w.lastEntry, saved.updated_at, 'Zeitpunkt der letzten Speicherung, nicht des geleerten Eintrags');
		assert.match(String(w.lastEntry), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

		// nicht in „Alle Einträge“, aber die Seite des Tages und die Versionen gibt es weiterhin
		const archive = await (await c.get('/archive/__data.json')).text();
		assert.ok(!archive.includes('2026-05-01'), 'nicht im Archiv');
		assert.equal((await c.get('/entry/2026-05-01')).status, 200);
		assert.equal((await c.get('/entry/2026-05-01/history')).status, 200);
	});

	test('wieder befüllt zählt er wieder', async () => {
		await c.api('/api/entry/2026-05-01', { content: filled('Wieder da') });
		assert.equal((await widgetAuth()).entries, 2);
	});
});

describe('Migration einer bestehenden Datenbank (Schema 2 → 3)', () => {
	test('fügt das Kennzeichen hinzu, bestehende Einträge zählen weiter', async () => {
		const first = await startServer();
		const { client } = await setupJournal(first);
		await client.api('/api/entry/2026-04-01', { content: filled('Vor dem Update') });
		await first.stop({ keepData: true });

		// Zustand wie vor diesem Update herstellen
		const file = join(first.dataDir, 'ediurnum.db');
		let db = new DatabaseSync(file);
		db.exec(`ALTER TABLE entries DROP COLUMN empty; UPDATE meta SET value = '2' WHERE key = 'schema';`);
		db.close();

		const second = await startServer({}, { dataDir: first.dataDir });
		try {
			const c = new Client(second.url);
			assert.equal((await c.action('/login', { password: PASSWORD })).location, '/');
			const r = await c.api('/api/export/plain?format=json');
			assert.deepEqual((r.json.entries as { date: string }[]).map((e) => e.date), ['2026-04-01']);
			db = new DatabaseSync(file);
			assert.equal((db.prepare(`SELECT value FROM meta WHERE key = 'schema'`).get() as { value: string }).value, '3');
			assert.equal((db.prepare('SELECT empty FROM entries').get() as { empty: number }).empty, 0);
			db.close();
		} finally {
			await second.stop();
		}
	});
});

describe('Backup-Versionen', () => {
	let source: TestServer;
	let backup: { format: string; version: number; data: string; keyFingerprint: string };
	let recoveryKey: string;
	before(async () => {
		source = await startServer();
		const r = await setupJournal(source);
		recoveryKey = r.recoveryKey;
		await r.client.api('/api/entry/2026-06-01', { content: filled('Im Backup') });
		await r.client.api('/api/entry/2026-06-02', { content: filled('Später geleert') });
		await r.client.api('/api/entry/2026-06-02', { content: cleared });
		backup = await (await r.client.get('/api/export/backup')).json();
	});
	after(() => source.stop());

	/** Backup mit veränderten Daten neu verpacken (wie es eine andere Version schreiben würde) */
	function repack(version: number, change: (data: { entries: Record<string, unknown>[] }) => void) {
		const dek = parseRecoveryKey(recoveryKey);
		const data = JSON.parse(gunzipSync(decrypt(dek, Buffer.from(backup.data, 'base64'), 'ediurnum/backup/v1')).toString('utf8'));
		change(data);
		return JSON.stringify({ ...backup, version, data: encrypt(dek, gzipSync(JSON.stringify(data)), 'ediurnum/backup/v1').toString('base64') });
	}

	async function restore(text: string) {
		const target = await startServer();
		const c = new Client(target.url);
		const r = await c.action('/setup?/restore', {
			password: 'Passwort-Ziel-123',
			confirm: 'Passwort-Ziel-123',
			recoveryKey,
			backup: new Blob([text])
		});
		return { target, c, r };
	}

	test('Aktuelle Backups haben Version 2 und behalten geleerte Einträge als geleert', async () => {
		assert.equal(backup.version, 2);
		const { target, c, r } = await restore(JSON.stringify(backup));
		try {
			assert.equal(r.location, '/');
			const db = new DatabaseSync(join(target.dataDir, 'ediurnum.db'));
			const rows = db.prepare('SELECT date, empty FROM entries ORDER BY date').all() as { date: string; empty: number }[];
			db.close();
			assert.deepEqual(rows.map((x) => [x.date, x.empty]), [
				['2026-06-01', 0],
				['2026-06-02', 1]
			]);
			assert.equal((await c.get('/entry/2026-06-02/history')).status, 200);
		} finally {
			await target.stop();
		}
	});

	test('Backups der Version 1 (ohne Kennzeichen) lassen sich weiterhin einspielen', async () => {
		const v1 = repack(1, (data) => {
			for (const e of data.entries) delete e.empty;
		});
		const { target, r } = await restore(v1);
		try {
			assert.equal(r.location, '/');
		} finally {
			await target.stop();
		}
	});

	test('Unbekannte Spalten im Backup werden ignoriert (landen nicht im SQL)', async () => {
		const odd = repack(2, (data) => {
			data.entries[0]['x) VALUES (1); DROP TABLE entries; --'] = 1;
			data.entries[0].unknown_column = 'egal';
		});
		const { target, r } = await restore(odd);
		try {
			assert.equal(r.location, '/');
			const db = new DatabaseSync(join(target.dataDir, 'ediurnum.db'));
			assert.equal((db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }).n, 2);
			db.close();
		} finally {
			await target.stop();
		}
	});

	test('Backups einer neueren Version werden mit Hinweis abgelehnt', async () => {
		const { target, r } = await restore(repack(3, () => {}));
		try {
			assert.equal(r.data?.error, 'backup.tooNew');
		} finally {
			await target.stop();
		}
	});
});
