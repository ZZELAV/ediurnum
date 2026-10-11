/**
 * Bereich 7: Dashboard-Widget, Docker-Log, Sitzungs-Cookie.
 * (Sperren nach Verlassen der App: e2e/session.test.ts; nach Inaktivität braucht mindestens 5 Minuten.)
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

	test('vor der Einrichtung gesperrt', async () => {
		assert.equal((await widget(server, `Bearer ${TOKEN}`)).status, 401);
		({ client: c } = await setupJournal(server));
	});

	test('leeres Tagebuch', async () => {
		const res = await widget(server, `Bearer ${TOKEN}`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get('cache-control'), 'no-store');
		assert.deepEqual(await res.json(), { entries: 0, lastEntry: null, writtenToday: false, streak: 0 });
	});

	test('Kennzahlen ohne Inhalte, auch bei gesperrtem Tagebuch', async () => {
		const save = (date: string) => c.api(`/api/entry/${date}`, { content: { mood: 3, sections: {}, free: 'Widget-Geheimnis' } });
		await save(zurichToday(-2));
		await save(zurichToday(-1));
		let w = await (await widget(server, `Bearer ${TOKEN}`)).json();
		assert.equal(w.writtenToday, false);
		assert.equal(w.streak, 2, 'heute noch offen: Serie bis gestern');
		await save(zurichToday());
		await c.action('/logout', {});
		const res = await widget(server, `bearer ${TOKEN}`);
		const text = await res.text();
		assert.doesNotMatch(text, /Widget-Geheimnis/);
		w = JSON.parse(text);
		assert.equal(w.entries, 3);
		assert.equal(w.writtenToday, true);
		assert.equal(w.streak, 3);
		assert.ok(Math.abs(Date.parse(w.lastEntry) - Date.now()) < 60_000, 'Zeitpunkt der letzten Speicherung');
		assert.deepEqual(Object.keys(w).sort(), ['entries', 'lastEntry', 'streak', 'writtenToday']);
	});

	test('falscher oder fehlender Token, danach Bremse', async () => {
		assert.equal((await widget(server)).status, 401);
		assert.equal((await widget(server, 'Bearer falsch')).status, 401);
		assert.equal((await widget(server, TOKEN.slice(1))).status, 401);
		for (let i = 0; i < 5; i++) await widget(server, 'Bearer falsch');
		assert.equal((await widget(server, `Bearer ${TOKEN}`)).status, 429, 'auch mit richtigem Token vorübergehend gesperrt');
		assert.match(await server.waitForOutput(/failed attempt key=widget:/), /failed attempt key=widget:/);
		assert.doesNotMatch(server.output(), new RegExp(TOKEN));
	});
});

describe('Widget ausgeschaltet', () => {
	test('ohne oder mit zu kurzem Token: 404', async () => {
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

describe('Docker-Log', () => {
	test('Standard (info): Start, Öffnen, Schliessen – keine Anfragen, keine Inhalte', async () => {
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
			assert.doesNotMatch(out, /GET \/|POST \//, 'Anfragen erst bei debug');
			assert.doesNotMatch(out, /Log-Geheimnis|e2e-Passwort/);
		} finally {
			await server.stop();
		}
	});

	test('debug: jede Anfrage mit Status und Dauer, ohne Suchparameter und Inhalte', async () => {
		const server = await startServer({ LOG_LEVEL: 'debug' });
		try {
			const { client } = await setupJournal(server);
			await client.api('/api/entry/2026-05-01', { content: { mood: 3, sections: {}, free: 'Debug-Geheimnis' } });
			await client.get('/api/export/plain?format=json');
			await client.get('/gibt-es-nicht');
			const out = await server.waitForOutput(/GET \/gibt-es-nicht status=404/);
			assert.match(out, /DEBUG POST \/api\/entry\/2026-05-01 status=200 ms=\d+/);
			assert.match(out, /DEBUG GET \/api\/export\/plain status=200/);
			assert.doesNotMatch(out, /plain\?format/, 'keine Suchparameter der Adresse');
			assert.match(out, /request rejected method=GET path=\/gibt-es-nicht status=404/);
			assert.doesNotMatch(out, /Debug-Geheimnis|e2e-Passwort/);
		} finally {
			await server.stop();
		}
	});

	test('error: nur Fehler', async () => {
		const server = await startServer({ LOG_LEVEL: 'error' });
		try {
			await setupJournal(server);
			assert.doesNotMatch(server.output(), /INFO|WARN/);
		} finally {
			await server.stop();
		}
	});
});

describe('Sitzungs-Cookie', () => {
	test('nur für die Browser-Sitzung, HttpOnly, SameSite=Strict, Secure bei https', async () => {
		const server = await startServer();
		try {
			const { client } = await setupJournal(server);
			const cookie = client.lastSetCookie.find((c) => c.startsWith('ediurnum_session='))!;
			assert.ok(cookie);
			assert.match(cookie, /HttpOnly/i);
			assert.match(cookie, /SameSite=Strict/i);
			assert.doesNotMatch(cookie, /Max-Age|Expires/i, 'endet mit der Browser-Sitzung');
			assert.doesNotMatch(cookie, /Secure/i, 'bei http:// nicht Secure, sonst ginge HTTP-Betrieb nicht');
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
