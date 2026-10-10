/**
 * Bereich 6: Einstellungen, Passwort, PIN, Wiederherstellungsschlüssel, Über mich, Backup/Export, Tagebuch löschen.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client, PASSWORD, PIN, setupJournal, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let c: Client;
let recoveryKey: string;

before(async () => {
	server = await startServer();
	({ client: c, recoveryKey } = await setupJournal(server));
});
after(() => server.stop());

async function login(password = PASSWORD) {
	const client = new Client(server.url);
	const r = await client.action('/login', { password });
	return { client, ok: r.location === '/' };
}

const general = (fields: Record<string, string>) =>
	c.action('/settings?/general', { name: 'Testperson', language: 'de', theme: 'system', sessionMinutes: '30', welcome: 'on', leaveMinutes: '1', ...fields });

/** Einstellungen, wie sie die Seite lädt */
async function settings() {
	const res = await c.get('/settings/__data.json');
	const json = (await res.json()) as { nodes: ({ data: unknown[] } | null)[] };
	// devalue: das letzte Knoten-Objekt gehört zur Seite; „settings“ zeigt auf das Einstellungsobjekt
	const data = json.nodes.at(-1)!.data;
	const root = data[0] as Record<string, number>;
	const s = data[root.settings] as Record<string, number>;
	return Object.fromEntries(Object.entries(s).map(([k, i]) => [k, data[i]]));
}

describe('Allgemein', () => {
	test('Name, Sprache, Design, Zeiten, Fokusmodus, Willkommenskarte', async () => {
		const r = await general({ name: '  Vale  ', language: 'en', theme: 'dark', sessionMinutes: '45', focusMode: 'on', welcome: '', leaveMinutes: '5' });
		assert.equal(r.type, 'success');
		assert.match(c.lastSetCookie.join(';'), /lang=en/);
		const s = await settings();
		assert.equal(s.name, 'Vale');
		assert.equal(s.language, 'en');
		assert.equal(s.theme, 'dark');
		assert.equal(s.sessionMinutes, 45);
		assert.equal(s.focusMode, true);
		assert.equal(s.welcomeHidden, true);
		assert.equal(s.leaveMinutes, 5);
		assert.match(await (await c.get('/settings')).text(), /<html lang="en"/);
	});

	test('Grenzen und ungültige Werte', async () => {
		await general({ sessionMinutes: '1', theme: 'pink', language: 'fr', name: 'x'.repeat(200) });
		let s = await settings();
		assert.equal(s.sessionMinutes, 5);
		assert.equal(s.theme, 'dark', 'unbekanntes Design ändert nichts');
		assert.equal(s.language, 'en', 'unbekannte Sprache ändert nichts');
		assert.equal(String(s.name).length, 60);
		await general({ sessionMinutes: '99999' });
		s = await settings();
		assert.equal(s.sessionMinutes, 720);
		await general({ theme: 'system' });
		assert.equal((await settings()).name, 'Testperson');
	});

	test('Einstellungen liegen nur verschlüsselt in der Datenbank', () => {
		const db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
		const raw = (db.prepare(`SELECT value FROM meta WHERE key = 'settings'`).get() as { value: string }).value;
		db.close();
		assert.ok(!raw.includes('Testperson') && !Buffer.from(raw, 'base64').includes(Buffer.from('Testperson')));
	});
});

describe('Passwort ändern', () => {
	test('prüft das aktuelle und das neue Passwort', async () => {
		let r = await c.action('/settings?/password', { current: 'falsch-falsch-falsch', password: 'Neues-Passwort-123', confirm: 'Neues-Passwort-123' });
		assert.equal(r.data?.error, 'error.wrongPassword');
		r = await c.action('/settings?/password', { current: PASSWORD, password: 'kurz', confirm: 'kurz' });
		assert.ok(String(r.data?.error).startsWith('error.'));
		r = await c.action('/settings?/password', { current: PASSWORD, password: 'Neues-Passwort-123', confirm: 'Anderes-Passwort-123' });
		assert.ok(String(r.data?.error).startsWith('error.'));
	});

	test('beendet andere Sitzungen, die eigene bleibt offen', async () => {
		const other = (await login()).client;
		assert.equal((await other.api('/api/session')).status, 200);
		const r = await c.action('/settings?/password', { current: PASSWORD, password: 'Neues-Passwort-123', confirm: 'Neues-Passwort-123' });
		assert.equal(r.type, 'success');
		assert.equal((await other.api('/api/session')).status, 401, 'anderes Gerät gesperrt');
		assert.equal((await c.api('/api/session')).status, 200, 'eigene Sitzung bleibt');
		assert.match(await server.waitForOutput(/password changed otherSessionsClosed=1/), /password changed otherSessionsClosed=1/);
		assert.equal((await login(PASSWORD)).ok, false, 'altes Passwort gilt nicht mehr');
		assert.equal((await login('Neues-Passwort-123')).ok, true);
		// zurück, damit die weiteren Tests das Standardpasswort verwenden können
		await c.action('/settings?/password', { current: 'Neues-Passwort-123', password: PASSWORD, confirm: PASSWORD });
	});
});

describe('PIN wechseln', () => {
	test('andere Sitzung mit offener PIN: kein Serverfehler, gesperrter Eintrag wieder zu', async () => {
		await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
		await c.api('/api/entry/2026-04-01', { content: { mood: 3, sections: {}, free: 'Geheimtext-PIN' } });
		await c.api('/api/entry/2026-04-01/lock', { locked: true });
		const other = (await login()).client;
		await other.api('/api/pin', { pin: PIN });
		assert.equal((await other.get('/entry/2026-04-01')).status, 200);
		const r = await c.action('/settings?/pin', { current: PIN, pin: '246810', confirm: '246810' });
		assert.equal(r.type, 'success');
		const page = await other.get('/entry/2026-04-01');
		assert.equal(page.status, 200, 'kein Serverfehler mit dem alten Sperr-Schlüssel');
		assert.doesNotMatch(await page.text(), /Geheimtext-PIN/);
		assert.equal((await other.api('/api/pin', { pin: '246810' })).status, 200);
		assert.match(await (await other.get('/entry/2026-04-01')).text(), /Geheimtext-PIN/);
	});
});

describe('Wiederherstellungsschlüssel testen', () => {
	test('richtig, falsch, ungültig', async () => {
		assert.equal((await c.action('/settings?/recoveryTest', { recoveryKey })).data?.success, 'settings.recoveryTestOk');
		assert.equal((await c.action('/settings?/recoveryTest', { recoveryKey: recoveryKey.toLowerCase().replace(/-/g, ' ') })).data?.success, 'settings.recoveryTestOk', 'Schreibweise egal');
		const otherServer = await startServer();
		try {
			const other = await setupJournal(otherServer);
			assert.equal((await c.action('/settings?/recoveryTest', { recoveryKey: other.recoveryKey })).data?.error, 'recovery.wrongKey');
		} finally {
			await otherServer.stop();
		}
		assert.ok((await c.action('/settings?/recoveryTest', { recoveryKey: 'abc' })).data?.error);
	});
});

describe('Über mich', () => {
	test('speichern, laden, unbekannte Felder verwerfen, verschlüsselt', async () => {
		const profile = { traits: { openness: 4 }, texts: { goals: 'Mehr lesen' }, unknown: 'weg' };
		const r = await c.action('/profile?/save', { profile: JSON.stringify(profile) });
		assert.equal(r.type, 'success');
		const html = await (await c.get('/profile')).text();
		assert.match(html, /Mehr lesen/);
		assert.doesNotMatch(html, /weg"/);
		assert.equal((await c.action('/profile?/save', { profile: '{kaputt' })).data?.error, 'common.error');
		const db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
		const raw = (db.prepare(`SELECT value FROM meta WHERE key = 'profile'`).get() as { value: string }).value;
		db.close();
		assert.ok(!Buffer.from(raw, 'base64').includes(Buffer.from('Mehr lesen')));
		assert.doesNotMatch(server.output(), /Mehr lesen/);
	});
});

describe('Export', () => {
	test('lesbarer Export ohne gesperrte Einträge (ohne PIN), als Markdown und JSON', async () => {
		await c.api('/api/entry/2026-04-02', { content: { mood: 4, sections: {}, free: 'Offen lesbar' } });
		await c.api('/api/pin', undefined, 'DELETE');
		const md = await c.get('/api/export/plain');
		assert.match(md.headers.get('content-disposition')!, /attachment; filename="ediurnum-export-\d{4}-\d\d-\d\d\.md"/);
		assert.equal(md.headers.get('cache-control'), 'no-store');
		const text = await md.text();
		assert.match(text, /^# ediurnum – Tagebuch/);
		assert.match(text, /Offen lesbar/);
		assert.doesNotMatch(text, /Geheimtext-PIN/);
		const json = (await c.api('/api/export/plain?format=json')).json as { skippedLocked: number; entries: unknown[] };
		assert.equal(json.skippedLocked, 1);
		assert.equal(json.entries.length, 1);
		assert.match(await server.waitForOutput(/readable export downloaded format=json skippedLocked=1/), /readable export downloaded format=json skippedLocked=1/);
		assert.equal((await new Client(server.url).get('/api/export/plain')).status, 401);
		assert.equal((await new Client(server.url).get('/api/export/backup')).status, 401);
	});

	test('Backup enthält alles und lässt sich vollständig wiederherstellen', async () => {
		await c.action('/insights?/import', { from: '2026-04-01', to: '2026-04-30', count: '1', answer: '## Fokuspunkte\n- Lesen' });
		const backup = await (await c.get('/api/export/backup')).text();
		assert.doesNotMatch(backup, /Offen lesbar|Mehr lesen|Lesen/);
		const target = await startServer();
		try {
			const t = new Client(target.url);
			const r = await t.action('/setup?/restore', { password: 'Ziel-Passwort-123', confirm: 'Ziel-Passwort-123', recoveryKey, backup: new Blob([backup]) });
			assert.equal(r.location, '/');
			assert.match(await (await t.get('/profile')).text(), /Mehr lesen/, 'Selbsteinschätzung');
			assert.match(await (await t.get('/')).text(), /Lesen/, 'Fokuspunkte der Auswertung');
			const exported = (await t.api('/api/export/plain?format=json')).json as { skippedLocked: number };
			assert.equal(exported.skippedLocked, 1, 'gesperrter Eintrag bleibt gesperrt');
			assert.equal((await t.api('/api/pin', { pin: '246810' })).status, 200, 'mit der PIN aus dem Backup');
			assert.match(await (await t.get('/entry/2026-04-01')).text(), /Geheimtext-PIN/);
		} finally {
			await target.stop();
		}
	});
});

describe('Tagebuch löschen', () => {
	test('Alle Einträge löschen: nur mit Passwort; Selbsteinschätzung und Einstellungen bleiben', async () => {
		assert.equal((await c.action('/settings?/purge', { mode: 'content', password: 'falsch' })).data?.error, 'error.wrongPassword');
		const r = await c.action('/settings?/purge', { mode: 'content', password: PASSWORD });
		assert.equal(r.data?.success, 'settings.purgeDone');
		const db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
		const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
		assert.deepEqual([count('entries'), count('entry_revisions'), count('analyses')], [0, 0, 0]);
		db.close();
		assert.match(await (await c.get('/profile')).text(), /Mehr lesen/);
		assert.equal((await settings()).name, 'Testperson');
		assert.match(await server.waitForOutput(/all entries deleted/), /all entries deleted/);
	});

	test('Komplett zurücksetzen: alles weg, alle Sitzungen beendet, weiter zur Einrichtung', async () => {
		const other = (await login()).client;
		const r = await c.action('/settings?/purge', { mode: 'all', password: PASSWORD });
		assert.equal(r.type, 'redirect');
		assert.equal(r.location, '/setup');
		assert.equal((await other.api('/api/session')).status, 401);
		assert.equal((await c.get('/')).headers.get('location'), '/setup');
		const db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
		const keys = (db.prepare('SELECT key FROM meta').all() as { key: string }[]).map((k) => k.key);
		db.close();
		assert.deepEqual(keys, ['schema']);
	});
});
