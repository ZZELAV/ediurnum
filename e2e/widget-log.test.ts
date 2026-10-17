/**
 * Area 7: dashboard widget, Docker log, session cookie.
 * (Locking after leaving the app: e2e/session.test.ts.)
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, setupJournal, startServer, zurichToday, type TestServer } from './helpers.ts';

const TOKEN = 't'.repeat(40);

const widget = (server: TestServer, auth?: string) =>
	new Client(server.url).request('/api/widget', { headers: auth === undefined ? {} : { authorization: auth } });

describe('Widget', () => {
	let server: TestServer;
	let c: Client;
	before(async () => {
		server = await startServer({ WIDGET_TOKEN: TOKEN });
	});
	after(() => server.stop());

	test('blocked before setup', async () => {
		assert.equal((await widget(server, `Bearer ${TOKEN}`)).status, 401);
		({ client: c } = await setupJournal(server));
	});

	test('empty journal', async () => {
		const res = await widget(server, `Bearer ${TOKEN}`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get('cache-control'), 'no-store');
		assert.deepEqual(await res.json(), { entries: 0, lastEntry: null, writtenToday: false, streak: 0 });
	});

	test('figures without content, also with a locked journal', async () => {
		const save = (date: string) => c.api(`/api/entry/${date}`, { content: { mood: 3, sections: {}, free: 'Widget-Geheimnis' } });
		await save(zurichToday(-2));
		await save(zurichToday(-1));
		let w = await (await widget(server, `Bearer ${TOKEN}`)).json();
		assert.equal(w.writtenToday, false);
		assert.equal(w.streak, 2, 'today still open: streak up to yesterday');
		await save(zurichToday());
		await c.action('/logout', {});
		const res = await widget(server, `bearer ${TOKEN}`);
		const text = await res.text();
		assert.doesNotMatch(text, /Widget-Geheimnis/);
		w = JSON.parse(text);
		assert.equal(w.entries, 3);
		assert.equal(w.writtenToday, true);
		assert.equal(w.streak, 3);
		assert.ok(Math.abs(Date.parse(w.lastEntry) - Date.now()) < 60_000, 'time of the latest save');
		assert.deepEqual(Object.keys(w).sort(), ['entries', 'lastEntry', 'streak', 'writtenToday']);
	});

	test('wrong or missing token, then the brake', async () => {
		assert.equal((await widget(server)).status, 401);
		assert.equal((await widget(server, 'Bearer falsch')).status, 401);
		assert.equal((await widget(server, TOKEN.slice(1))).status, 401);
		for (let i = 0; i < 5; i++) await widget(server, 'Bearer falsch');
		assert.equal((await widget(server, `Bearer ${TOKEN}`)).status, 429, 'blocked for a while even with the right token');
		assert.match(await server.waitForOutput(/failed attempt key=widget:/), /failed attempt key=widget:/);
		assert.doesNotMatch(server.output(), new RegExp(TOKEN));
	});
});

describe('Widget switched off', () => {
	test('without or with a too short token: 404', async () => {
		for (const env of [{}, { WIDGET_TOKEN: 'kurz' }]) {
			const server = await startServer(env);
			try {
				await setupJournal(server);
				assert.equal((await widget(server, 'Bearer kurz')).status, 404);
			} finally {
				await server.stop();
			}
		}
	});
});

describe('Docker log', () => {
	test('default (info): start, opening, closing – no requests, no content', async () => {
		const server = await startServer();
		try {
			const { client } = await setupJournal(server);
			await client.api('/api/entry/2026-05-01', { content: { mood: 3, sections: {}, free: 'Log-Geheimnis' } });
			await client.api('/api/search', { query: 'Log-Geheimnis' });
			await client.action('/logout', {});
			const out = await server.waitForOutput(/journal closed/);
			assert.match(out, /INFO  ediurnum started version=\S+ node=v\d+/);
			assert.match(out, /journal created/);
			assert.match(out, /journal closed/);
			assert.doesNotMatch(out, /GET \/|POST \//, 'requests only with debug');
			assert.doesNotMatch(out, /Log-Geheimnis|e2e-Passwort/);
		} finally {
			await server.stop();
		}
	});

	test('debug: every request with status and duration, without query parameters and content', async () => {
		const server = await startServer({ LOG_LEVEL: 'debug' });
		try {
			const { client } = await setupJournal(server);
			await client.api('/api/entry/2026-05-01', { content: { mood: 3, sections: {}, free: 'Debug-Geheimnis' } });
			await client.get('/api/export/plain?format=json');
			await client.get('/gibt-es-nicht');
			const out = await server.waitForOutput(/GET \/gibt-es-nicht status=404/);
			assert.match(out, /DEBUG POST \/api\/entry\/2026-05-01 status=200 ms=\d+/);
			assert.match(out, /DEBUG GET \/api\/export\/plain status=200/);
			assert.doesNotMatch(out, /plain\?format/, 'no query parameters of the address');
			assert.match(out, /request rejected method=GET path=\/gibt-es-nicht status=404/);
			assert.doesNotMatch(out, /Debug-Geheimnis|e2e-Passwort/);
		} finally {
			await server.stop();
		}
	});

	test('error: only errors', async () => {
		const server = await startServer({ LOG_LEVEL: 'error' });
		try {
			await setupJournal(server);
			assert.doesNotMatch(server.output(), /INFO|WARN/);
		} finally {
			await server.stop();
		}
	});
});

describe('Session cookie', () => {
	test('only for the browser session, HttpOnly, SameSite=Strict, Secure with https', async () => {
		const server = await startServer();
		try {
			const { client } = await setupJournal(server);
			const cookie = client.lastSetCookie.find((c) => c.startsWith('ediurnum_session='))!;
			assert.ok(cookie);
			assert.match(cookie, /HttpOnly/i);
			assert.match(cookie, /SameSite=Strict/i);
			assert.doesNotMatch(cookie, /Max-Age|Expires/i, 'ends with the browser session');
			assert.doesNotMatch(cookie, /Secure/i, 'not Secure with http://, otherwise HTTP operation would not work');
		} finally {
			await server.stop();
		}
		const secure = await startServer({ COOKIE_SECURE: 'true' });
		try {
			const { client } = await setupJournal(secure);
			assert.match(client.lastSetCookie.find((c) => c.startsWith('ediurnum_session='))!, /Secure/i);
		} finally {
			await secure.stop();
		}
	});
});
