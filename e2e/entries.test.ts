/**
 * Bereich 2: Eintrag schreiben, Versionen, Sperren und PIN, KI-Freigabe, Löschen.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client, PIN, setupJournal, startServer, type TestServer } from './helpers.ts';

const DAY = '2026-03-02';

function daily(experienced: string) {
	return { gratitude: ['Kaffee', '', ''], experienced, highlight: '', takeaway: '' };
}

let server: TestServer;
let c: Client;
let db: DatabaseSync;

before(async () => {
	server = await startServer();
	({ client: c } = await setupJournal(server));
	db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
});
after(async () => {
	db.close();
	await server.stop();
});

const row = (date: string) =>
	db.prepare('SELECT id, revision, locked, ai_allowed, kinds FROM entries WHERE date = ?').get(date) as
		| { id: string; revision: number; locked: number; ai_allowed: number; kinds: string }
		| undefined;

/** Lesbarer Export: alle Einträge, die gerade entschlüsselt werden können. */
async function readable(): Promise<Map<string, { mood: number | null; free: string; sections: Record<string, Record<string, unknown>> }>> {
	const r = await c.api('/api/export/plain?format=json');
	const list = r.json.entries as { date: string; content: { mood: number | null; free: string; sections: Record<string, Record<string, unknown>> } }[];
	return new Map(list.map((e) => [e.date, e.content]));
}

/** Simuliert, dass die aktuelle Fassung an einem früheren Tag begonnen wurde. */
function ageCurrentRevision(date: string) {
	db.prepare(`UPDATE entries SET rev_started_at = '2020-01-01T12:00:00.000Z' WHERE date = ?`).run(date);
}

describe('Schreiben', () => {
	test('Neuer Eintrag wird verschlüsselt gespeichert', async () => {
		const r = await c.api(`/api/entry/${DAY}`, { content: { mood: 4, sections: { daily: daily('Ein Tag am See') }, free: 'Gedanken' } });
		assert.equal(r.status, 200);
		const meta = r.json.meta as { date: string; revision: number; kinds: string[]; locked: boolean; aiAllowed: boolean };
		assert.equal(meta.date, DAY);
		assert.equal(meta.revision, 1);
		assert.deepEqual(meta.kinds, ['daily']);
		assert.equal(meta.locked, false);
		assert.equal(meta.aiAllowed, true);
		const file = readFileSync(join(server.dataDir, 'ediurnum.db-wal'));
		assert.ok(!file.includes(Buffer.from('Ein Tag am See')), 'kein Klartext in der Datenbank');
		assert.equal((await readable()).get(DAY)?.sections.daily.experienced, 'Ein Tag am See');
	});

	test('Leerer neuer Eintrag wird nicht angelegt', async () => {
		const empty = { gratitude: ['', '', ''], experienced: '', highlight: '', takeaway: '' };
		const r = await c.api('/api/entry/2026-03-01', { content: { mood: null, sections: { daily: empty }, free: '  ' } });
		assert.equal(r.status, 200);
		assert.equal(r.json.meta, null);
		assert.equal(row('2026-03-01'), undefined);
	});

	test('Unbekannte Felder und ungültige Werte werden verworfen', async () => {
		await c.api('/api/entry/2026-02-01', {
			content: {
				mood: 9,
				evil: '<script>',
				sections: {
					daily: { experienced: 'ok', fremd: 'weg', gratitude: ['a', 5, 'c', 'd'] },
					feelings: { energy: 7, emotions: ['joy', 'hacked'] },
					unbekannt: { x: 1 }
				},
				free: 42
			}
		});
		const e = (await readable()).get('2026-02-01')!;
		assert.equal(e.mood, null);
		assert.equal(e.free, '');
		assert.deepEqual(Object.keys(e.sections).sort(), ['daily', 'feelings']);
		assert.equal(e.sections.daily.fremd, undefined);
		assert.deepEqual(e.sections.daily.gratitude, ['a', '', 'c']);
		assert.equal(e.sections.feelings.energy, null);
		assert.deepEqual(e.sections.feelings.emotions, ['joy']);
		assert.equal(row('2026-02-01')!.kinds, 'daily,feelings');
	});

	test('Zukunft, ungültiges Datum und fehlerhafte Anfragen werden abgewiesen', async () => {
		assert.equal((await c.api('/api/entry/2999-01-01', { content: {} })).json.error, 'error.futureDate');
		assert.equal((await c.api('/api/entry/2026-02-30', { content: {} })).status, 404);
		assert.equal((await c.api('/api/entry/heute', { content: {} })).status, 404);
		for (const body of ['{kaputt', '[]', 'null']) {
			const res = await c.request(`/api/entry/${DAY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
			assert.equal(res.status, 400, body);
		}
		assert.doesNotMatch(server.output(), /ERROR/, 'kein Serverfehler im Log');
		const anonymous = new Client(server.url);
		assert.equal((await anonymous.api(`/api/entry/${DAY}`, { content: {} })).status, 401);
	});
});

describe('Versionen', () => {
	test('Am selben Tag bleibt es eine Version, unverändertes Speichern ändert nichts', async () => {
		const before = row(DAY)!;
		await c.api(`/api/entry/${DAY}`, { content: { mood: 3, sections: { daily: daily('Ein Tag am See, korrigiert') }, free: 'Gedanken' } });
		assert.equal(row(DAY)!.revision, before.revision);
		const saved = db.prepare('SELECT updated_at FROM entries WHERE date = ?').get(DAY) as { updated_at: string };
		await c.api(`/api/entry/${DAY}`, { content: { mood: 3, sections: { daily: daily('Ein Tag am See, korrigiert') }, free: 'Gedanken' } });
		assert.equal((db.prepare('SELECT updated_at FROM entries WHERE date = ?').get(DAY) as { updated_at: string }).updated_at, saved.updated_at);
	});

	test('Erste Bearbeitung an einem neuen Tag archiviert die bisherige Fassung', async () => {
		ageCurrentRevision(DAY);
		await c.api(`/api/entry/${DAY}`, { content: { mood: 2, sections: { daily: daily('Am nächsten Tag ergänzt') }, free: 'Gedanken' } });
		assert.equal(row(DAY)!.revision, 2);
		const revs = db.prepare('SELECT revision FROM entry_revisions WHERE entry_id = ?').all(row(DAY)!.id) as { revision: number }[];
		assert.deepEqual(revs.map((r) => r.revision), [1]);
	});

	test('Frühere Version wiederherstellen ergibt eine neue Version mit dem alten Inhalt', async () => {
		const r = await c.api(`/api/entry/${DAY}/restore`, { revision: 1 });
		assert.equal(r.status, 200);
		assert.equal(row(DAY)!.revision, 3);
		assert.equal((await readable()).get(DAY)?.sections.daily.experienced, 'Ein Tag am See, korrigiert');
		assert.equal((await c.api(`/api/entry/${DAY}/restore`, { revision: 99 })).status, 404);
	});

	test('Versionsseite zeigt alle Fassungen', async () => {
		const res = await c.get(`/entry/${DAY}/history`);
		assert.equal(res.status, 200);
		const html = await res.text();
		assert.match(html, /Am nächsten Tag ergänzt/);
		assert.match(html, /Ein Tag am See, korrigiert/);
	});
});

describe('Sperren mit PIN', () => {
	test('Ohne PIN lässt sich nichts sperren', async () => {
		assert.equal((await c.api(`/api/entry/${DAY}/lock`, { locked: true })).json.error, 'error.noPin');
		assert.equal((await c.api('/api/pin', { pin: '1234' })).json.error, 'error.noPin');
	});

	test('PIN festlegen, Eintrag samt Versionen sperren', async () => {
		const r = await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
		assert.equal(r.type, 'success');
		assert.match(await server.waitForOutput(/PIN set/), /PIN set/);
		// nach dem Festlegen ist die PIN in dieser Sitzung 10 Minuten offen
		assert.equal((await c.api(`/api/entry/${DAY}/lock`, { locked: true })).status, 200);
		const locked = row(DAY)!;
		assert.equal(locked.locked, 1);
		assert.equal(locked.ai_allowed, 0, 'Sperren schliesst von der KI aus');
		const revLocked = db.prepare('SELECT locked FROM entry_revisions WHERE entry_id = ?').all(locked.id) as { locked: number }[];
		assert.ok(revLocked.every((r) => r.locked === 1), 'auch alle früheren Versionen gesperrt');
		assert.ok((await readable()).has(DAY), 'mit offener PIN lesbar');
	});

	test('Nach „Wieder sperren“ ist der Eintrag unlesbar und unveränderbar', async () => {
		assert.equal((await c.api('/api/pin', undefined, 'DELETE')).status, 200);
		assert.ok(!(await readable()).has(DAY));
		assert.equal((await c.api(`/api/entry/${DAY}`, { content: { mood: 1, sections: {}, free: 'x' } })).status, 423);
		assert.equal((await c.api(`/api/entry/${DAY}/restore`, { revision: 1 })).status, 423);
		assert.equal((await c.api(`/api/entry/${DAY}`, undefined, 'DELETE')).status, 423);
		assert.equal((await c.api(`/api/entry/${DAY}/lock`, { locked: false })).status, 423);
		const history = await (await c.get(`/entry/${DAY}/history`)).text();
		assert.doesNotMatch(history, /Ein Tag am See/);
		// Andere Sitzungen kommen ohne PIN ebenfalls nicht an den Inhalt
		const other = new Client(server.url);
		await other.action('/login', { password: 'e2e-Passwort-lang-genug' });
		assert.ok(!(await readableFor(other)).has(DAY));
	});

	test('Falsche PIN und unsinnige Eingaben werden abgelehnt', async () => {
		for (const pin of ['000000', 'abc', '1'.repeat(5000), '']) {
			const r = await c.api('/api/pin', { pin });
			assert.equal(r.status, 403, pin.slice(0, 10));
			assert.equal(r.json.error, 'error.wrongPin');
		}
		// richtige PIN (noch unter der Sperrgrenze von fünf Fehlversuchen)
		const ok = await c.api('/api/pin', { pin: PIN });
		assert.equal(ok.status, 200);
		assert.ok(Number(ok.json.until) > Date.now());
		assert.ok((await readable()).has(DAY));
	});

	test('Entsperren lässt die KI-Freigabe aus', async () => {
		assert.equal((await c.api(`/api/entry/${DAY}/lock`, { locked: false })).status, 200);
		assert.equal(row(DAY)!.locked, 0);
		assert.equal(row(DAY)!.ai_allowed, 0, 'erst eine ausdrückliche Freigabe erlaubt die KI wieder');
		await c.api(`/api/entry/${DAY}/ai`, { allowed: true });
		assert.equal(row(DAY)!.ai_allowed, 1);
		await c.api(`/api/entry/${DAY}/ai`, { allowed: false });
		assert.equal(row(DAY)!.ai_allowed, 0);
	});

	test('PIN wechseln verschlüsselt gesperrte Einträge neu', async () => {
		await c.api(`/api/entry/${DAY}/lock`, { locked: true });
		const wrong = await c.action('/settings?/pin', { current: '999999', pin: '135790', confirm: '135790' });
		assert.equal(wrong.data?.error, 'error.wrongPin');
		const r = await c.action('/settings?/pin', { current: PIN, pin: '135790', confirm: '135790' });
		assert.equal(r.type, 'success');
		assert.match(await server.waitForOutput(/PIN changed/), /PIN changed/);
		await c.api('/api/pin', undefined, 'DELETE');
		assert.equal((await c.api('/api/pin', { pin: PIN })).status, 403, 'alte PIN gilt nicht mehr');
		assert.equal((await c.api('/api/pin', { pin: '135790' })).status, 200);
		assert.equal((await readable()).get(DAY)?.sections.daily.experienced, 'Ein Tag am See, korrigiert');
	});
});

describe('Löschen', () => {
	test('Gesperrter Eintrag nur mit PIN, Versionen werden mitgelöscht', async () => {
		const id = row(DAY)!.id;
		await c.api('/api/pin', undefined, 'DELETE');
		assert.equal((await c.api(`/api/entry/${DAY}`, undefined, 'DELETE')).status, 423);
		await c.api('/api/pin', { pin: '135790' });
		assert.equal((await c.api(`/api/entry/${DAY}`, undefined, 'DELETE')).status, 200);
		assert.equal(row(DAY), undefined);
		assert.equal((db.prepare('SELECT COUNT(*) AS n FROM entry_revisions WHERE entry_id = ?').get(id) as { n: number }).n, 0);
	});

	test('Nicht vorhandenen Eintrag löschen ist kein Fehler', async () => {
		assert.equal((await c.api('/api/entry/2026-01-01', undefined, 'DELETE')).status, 200);
	});
});

async function readableFor(client: Client) {
	const r = await client.api('/api/export/plain?format=json');
	return new Set((r.json.entries as { date: string }[]).map((e) => e.date));
}
