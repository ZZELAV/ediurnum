/**
 * Bereich 3: Alle Einträge (Kalender) und Suche.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PIN, setupJournal, startServer, zurichToday, type TestServer } from './helpers.ts';

let server: TestServer;
let c: Client;

type Result = { date: string; mood: number | null; locked: boolean; field: string; parts: { text: string; hit: boolean }[] };

async function search(query: unknown, client = c) {
	const r = await client.api('/api/search', { query });
	return { status: r.status, results: (r.json.results ?? []) as Result[], skippedLocked: r.json.skippedLocked as number };
}

const dates = (results: Result[]) => results.map((r) => r.date);

before(async () => {
	server = await startServer();
	({ client: c } = await setupJournal(server));
	const save = (date: string, content: unknown) => c.api(`/api/entry/${date}`, { content });
	await save('2026-02-27', { mood: 5, sections: { daily: { gratitude: ['Kaffee im Café', '', ''], highlight: 'Spaziergang an der Straße zum See' } }, free: '' });
	await save('2026-03-02', { mood: 2, sections: { feelings: { emotions: ['joy'] } }, free: 'Regen und Bücher' });
	await save('2026-03-05', { mood: null, sections: {}, free: 'Geheimnis am See' });
	await save('2026-03-09', { mood: 3, sections: {}, free: 'Später geleert, See' });
	await save('2026-03-09', { mood: null, sections: {}, free: '' });
	// 5. März sperren
	await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
	await c.api('/api/entry/2026-03-05/lock', { locked: true });
	await c.api('/api/pin', undefined, 'DELETE');
});
after(async () => {
	await server.stop();
});

describe('Alle Einträge', () => {
	test('Monate und Tage mit Stimmung, geleerte Einträge fehlen', async () => {
		const res = await c.get('/archive');
		assert.equal(res.status, 200);
		const html = await res.text();
		assert.match(html, /href="\/entry\/2026-02-27" class="day has m5 svelte-\w+"/);
		assert.match(html, /href="\/entry\/2026-03-02" class="day has m2 svelte-\w+"/);
		assert.match(html, /href="\/entry\/2026-03-05" class="day has m0 svelte-\w+"/);
		assert.match(html, /href="\/entry\/2026-03-09" class="day svelte-\w+">9</, 'geleerter Tag erscheint wie ein leerer');
		assert.match(html, /2 Einträge/, 'März zählt nur zwei Einträge');
		assert.match(html, /Spaziergang an der Straße zum See/, 'Auszug im Titel');
	});

	test('Alle Monate vom laufenden bis zum ersten Eintrag, auch ohne Eintrag', async () => {
		const html = await (await c.get('/archive')).text();
		const titles = [...html.matchAll(/<h2 class="svelte-\w+">([^<]+)<\/h2>/g)].map((m) => m[1]);
		const fmt = new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
		const expected: string[] = [];
		const today = new Date(zurichToday() + 'T00:00:00Z');
		for (let d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); d >= new Date(Date.UTC(2026, 1, 1)); d.setUTCMonth(d.getUTCMonth() - 1)) {
			expected.push(fmt.format(d));
		}
		assert.deepEqual(titles, expected);
		assert.equal(titles.at(-1), 'Februar 2026');
		assert.match(html, /0 Einträge/);
	});

	test('Gesperrter Eintrag ohne PIN: kein Auszug, keine Stimmung', async () => {
		const html = await (await c.get('/archive')).text();
		assert.doesNotMatch(html, /Geheimnis/);
		await c.api('/api/pin', { pin: PIN });
		assert.match(await (await c.get('/archive')).text(), /Geheimnis am See/);
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('Daten für den Filter: Gefühle und Rückblicke, gesperrte Einträge ohne PIN nicht lesbar', async () => {
		const html = await (await c.get('/archive')).text();
		assert.match(html, /date:"2026-03-02",mood:2,locked:false,readable:true,kinds:\[[^\]]*"feelings"[^\]]*\],emotions:\["joy"\]/);
		assert.match(html, /date:"2026-03-05",mood:null,locked:true,readable:false,kinds:\[[^\]]*\],emotions:\[\]/);
		await c.api('/api/pin', { pin: PIN });
		assert.match(await (await c.get('/archive')).text(), /date:"2026-03-05",mood:null,locked:true,readable:true/);
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('Ohne Anmeldung zur Anmeldung umgeleitet', async () => {
		const res = await new Client(server.url).get('/archive');
		assert.equal(res.status, 303);
		assert.equal(res.headers.get('location'), '/login');
	});
});

describe('Suche', () => {
	test('Findet unabhängig von Gross-/Kleinschreibung, Akzenten und ß', async () => {
		assert.deepEqual(dates((await search('CAFE')).results), ['2026-02-27']);
		assert.deepEqual(dates((await search('strasse')).results), ['2026-02-27']);
		assert.deepEqual(dates((await search('bucher')).results), ['2026-03-02']);
	});

	test('Alle Begriffe müssen vorkommen; Auszug mit Markierung und Feld', async () => {
		const { results } = await search('see kaffee');
		assert.equal(results.length, 1);
		const [r] = results;
		assert.equal(r.mood, 5);
		assert.equal(r.field, 'section.daily.gratitude');
		assert.deepEqual(r.parts.filter((p) => p.hit).map((p) => p.text), ['Kaffee']);
	});

	test('Gefühle in der Sprache der App', async () => {
		assert.deepEqual(dates((await search('freude')).results), ['2026-03-02']);
		const general = (language: string) =>
			c.action('/settings?/general', { name: 'Testperson', language, theme: 'system', sessionMinutes: '30', welcome: 'on' });
		assert.equal((await general('en')).type, 'success');
		const en = await search('joy');
		await general('de');
		assert.deepEqual(dates(en.results), ['2026-03-02']);
	});

	test('Geleerte Einträge werden nicht gefunden', async () => {
		assert.deepEqual(dates((await search('geleert')).results), []);
	});

	test('Gesperrte Einträge nur mit offener PIN', async () => {
		const closed = await search('see');
		assert.deepEqual(dates(closed.results), ['2026-02-27']);
		assert.equal(closed.skippedLocked, 1);
		await c.api('/api/pin', { pin: PIN });
		const open = await search('see');
		assert.deepEqual(dates(open.results), ['2026-03-05', '2026-02-27']);
		assert.equal(open.results[0].locked, true);
		assert.equal(open.skippedLocked, 0);
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('Leere oder unsinnige Anfragen', async () => {
		for (const q of ['', '   ', undefined, null]) {
			const r = await search(q);
			assert.equal(r.status, 200);
			assert.deepEqual(r.results, []);
			assert.equal(r.skippedLocked, 0, 'ohne Begriff wird nichts gezählt');
		}
		assert.equal((await search({ x: 1 })).status, 200);
		assert.equal((await search('x'.repeat(10_000))).status, 200);
		const bad = await c.request('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1]' });
		assert.equal(bad.status, 400);
	});

	test('Nur per POST und nur angemeldet', async () => {
		assert.equal((await c.get('/api/search?query=see')).status, 405);
		assert.equal((await search('see', new Client(server.url))).status, 401);
	});

	test('Suchbegriff landet nicht im Log', async () => {
		await search('Unverwechselbar');
		assert.doesNotMatch(server.output(), /Unverwechselbar/i);
	});
});
