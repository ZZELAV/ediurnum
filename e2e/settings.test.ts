/**
 * Area 6: settings, password, PIN, recovery key, about me, backup/export, deleting the journal.
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

/** Settings as the page loads them */
async function settings() {
	const res = await c.get('/settings/__data.json');
	const json = (await res.json()) as { nodes: ({ data: unknown[] } | null)[] };
	// devalue: the last node object belongs to the page; "settings" points to the settings object
	const data = json.nodes.at(-1)!.data;
	const root = data[0] as Record<string, number>;
	const s = data[root.settings] as Record<string, number>;
	return Object.fromEntries(Object.entries(s).map(([k, i]) => [k, data[i]]));
}

describe('General', () => {
	test('name, language, theme, times, focus mode, welcome card', async () => {
		const r = await general({ name: '  Vale  ', language: 'en', theme: 'dark', sessionMinutes: '45', focusMode: 'on', welcome: '', leaveMinutes: '5' });
		assert.equal(r.type, 'success');
		assert.match(c.lastSetCookie.join(';'), /lang=en/);
		assert.match(c.lastSetCookie.join(';'), /theme=dark/);
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

	test('limits and invalid values', async () => {
		await general({ sessionMinutes: '1', theme: 'pink', language: 'fr', name: 'x'.repeat(200) });
		let s = await settings();
		assert.equal(s.sessionMinutes, 5);
		assert.equal(s.theme, 'dark', 'an unknown theme changes nothing');
		assert.equal(s.language, 'en', 'an unknown language changes nothing');
		assert.equal(String(s.name).length, 60);
		await general({ sessionMinutes: '99999' });
		s = await settings();
		assert.equal(s.sessionMinutes, 720);
		await general({ theme: 'system' });
		assert.equal((await settings()).name, 'Testperson');
	});

	test('the login page uses the theme of the settings', async () => {
		await general({ theme: 'dark' });
		const { client } = await login();
		assert.equal(client.cookies.get('theme'), 'dark');
		await client.action('/logout', {});
		assert.match(await (await client.get('/login')).text(), /<html lang="de" data-theme="dark"/);
		client.cookies.set('theme', 'pink');
		assert.match(await (await client.get('/login')).text(), /data-theme="system"/, 'an unknown theme follows the system');
		assert.match(await (await new Client(server.url).get('/login')).text(), /data-theme="system"/, 'without a cookie the system decides');
		await general({ theme: 'system' });
	});

	test('without a session the browser language decides, English unless it is German', async () => {
		const html = async (lang: string) => (await new Client(server.url).get('/login', { 'accept-language': lang })).text();
		assert.match(await html('de-CH,de;q=0.9'), /<html lang="de"/);
		assert.match(await html('en-US,en;q=0.9'), /<html lang="en"/);
		assert.match(await html('fr-CH,fr;q=0.9,de;q=0.8'), /<html lang="en"/);
	});

	test('settings are stored only encrypted in the database', () => {
		const db = new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
		const raw = (db.prepare(`SELECT value FROM meta WHERE key = 'settings'`).get() as { value: string }).value;
		db.close();
		assert.ok(!raw.includes('Testperson') && !Buffer.from(raw, 'base64').includes(Buffer.from('Testperson')));
	});
});

describe('Changing the password', () => {
	test('checks the current and the new password', async () => {
		let r = await c.action('/settings?/password', { current: 'falsch-falsch-falsch', password: 'Neues-Passwort-123', confirm: 'Neues-Passwort-123' });
		assert.equal(r.data?.error, 'error.wrongPassword');
		r = await c.action('/settings?/password', { current: PASSWORD, password: 'kurz', confirm: 'kurz' });
		assert.ok(String(r.data?.error).startsWith('error.'));
		r = await c.action('/settings?/password', { current: PASSWORD, password: 'Neues-Passwort-123', confirm: 'Anderes-Passwort-123' });
		assert.ok(String(r.data?.error).startsWith('error.'));
	});

	test('ends other sessions, the own one stays open', async () => {
		const other = (await login()).client;
		assert.equal((await other.api('/api/session')).status, 200);
		const r = await c.action('/settings?/password', { current: PASSWORD, password: 'Neues-Passwort-123', confirm: 'Neues-Passwort-123' });
		assert.equal(r.type, 'success');
		assert.equal((await other.api('/api/session')).status, 401, 'other device locked');
		assert.equal((await c.api('/api/session')).status, 200, 'own session stays');
		assert.match(await server.waitForOutput(/password changed otherSessionsClosed=1/), /password changed otherSessionsClosed=1/);
		assert.equal((await login(PASSWORD)).ok, false, 'the old password is no longer valid');
		assert.equal((await login('Neues-Passwort-123')).ok, true);
		// back, so the following tests can use the default password
		await c.action('/settings?/password', { current: 'Neues-Passwort-123', password: PASSWORD, confirm: PASSWORD });
	});
});

describe('Changing the PIN', () => {
	test('other session with an open PIN: no server error, locked entry closed again', async () => {
		await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
		await c.api('/api/entry/2026-04-01', { content: { mood: 3, sections: {}, free: 'Geheimtext-PIN' } });
		await c.api('/api/entry/2026-04-01/lock', { locked: true });
		const other = (await login()).client;
		await other.api('/api/pin', { pin: PIN });
		assert.equal((await other.get('/entry/2026-04-01')).status, 200);
		const r = await c.action('/settings?/pin', { current: PIN, pin: '246810', confirm: '246810' });
		assert.equal(r.type, 'success');
		const page = await other.get('/entry/2026-04-01');
		assert.equal(page.status, 200, 'no server error with the old lock key');
		assert.doesNotMatch(await page.text(), /Geheimtext-PIN/);
		assert.equal((await other.api('/api/pin', { pin: '246810' })).status, 200);
		assert.match(await (await other.get('/entry/2026-04-01')).text(), /Geheimtext-PIN/);
	});
});

describe('Testing the recovery key', () => {
	test('right, wrong, invalid', async () => {
		assert.equal((await c.action('/settings?/recoveryTest', { recoveryKey })).data?.success, 'settings.recoveryTestOk');
		assert.equal((await c.action('/settings?/recoveryTest', { recoveryKey: recoveryKey.toLowerCase().replace(/-/g, ' ') })).data?.success, 'settings.recoveryTestOk', 'spelling does not matter');
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

describe('About me', () => {
	test('save, load, discard unknown fields, encrypted', async () => {
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
	test('readable export without locked entries (without PIN), as Markdown and JSON', async () => {
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

	test('the backup contains everything and can be restored completely', async () => {
		await c.action('/insights?/import', { from: '2026-04-01', to: '2026-04-30', count: '1', answer: '## Fokuspunkte\n- Lesen' });
		const backup = await (await c.get('/api/export/backup')).text();
		assert.doesNotMatch(backup, /Offen lesbar|Mehr lesen|Lesen/);
		const target = await startServer();
		try {
			const t = new Client(target.url);
			const r = await t.action('/setup?/restore', { password: 'Ziel-Passwort-123', confirm: 'Ziel-Passwort-123', recoveryKey, backup: new Blob([backup]) });
			assert.equal(r.location, '/');
			assert.match(await (await t.get('/profile')).text(), /Mehr lesen/, 'self-assessment');
			assert.match(await (await t.get('/')).text(), /Lesen/, 'focus points of the analysis');
			const exported = (await t.api('/api/export/plain?format=json')).json as { skippedLocked: number };
			assert.equal(exported.skippedLocked, 1, 'a locked entry stays locked');
			assert.equal((await t.api('/api/pin', { pin: '246810' })).status, 200, 'with the PIN from the backup');
			assert.match(await (await t.get('/entry/2026-04-01')).text(), /Geheimtext-PIN/);
		} finally {
			await target.stop();
		}
	});
});

describe('Deleting the journal', () => {
	test('deleting all entries: only with the password; self-assessment and settings stay', async () => {
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

	test('complete reset: everything gone, all sessions ended, on to the setup', async () => {
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
