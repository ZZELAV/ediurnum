/**
 * Statistics: page, period and locked entries (the calculation in detail: tests/stats.test.ts).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PIN, setupJournal, startServer, zurichToday, type TestServer } from './helpers.ts';

const TOKEN = 'w'.repeat(40);
/** Text without comments and tags. */
const strip = (html: string) => html.replace(/<!--[\s\S]*?-->|<[^>]+>/g, '').trim();

/** Value below a label on the dashboard (`<dt>` → `<dd>`). */
function dashboardValue(html: string, label: string) {
	const i = html.search(new RegExp(`<dt class="eyebrow[^"]*">${label}</dt>`));
	assert.ok(i >= 0, `dashboard: ${label} missing`);
	return strip(html.slice(i).match(/<dd[^>]*>([\s\S]*?)<\/dd>/)![1]);
}

/** Text of a tile in the statistics, e.g. "4.0" below the average mood. */
function tile(html: string, label: string) {
	const i = html.search(new RegExp(`class="eyebrow[^"]*">${label}</span>`));
	assert.ok(i >= 0, `tile ${label} missing`);
	return strip(html.slice(i).match(/<strong[^>]*>([\s\S]*?)<\/strong>/)![1]);
}

describe('Statistics', () => {
	let server: TestServer;
	let c: Client;
	before(async () => {
		server = await startServer({ WIDGET_TOKEN: TOKEN });
		({ client: c } = await setupJournal(server));
	});
	after(() => server.stop());

	test('empty journal', async () => {
		const res = await c.get('/stats');
		assert.equal(res.status, 200);
		assert.match(await res.text(), /Noch keine Einträge/);
	});

	test('in the navigation, settings still reachable', async () => {
		const html = await (await c.get('/')).text();
		assert.match(html, /href="\/stats"/);
		assert.match(html, /href="\/settings"/);
	});

	test('figures; without PIN locked entries only count for number, streaks and reviews', async () => {
		const save = (date: string, content: unknown) => c.api(`/api/entry/${date}`, { content });
		await save(zurichToday(-2), { mood: 2, sections: { feelings: { energy: 3, emotions: ['joy', 'stressed'] } }, free: '' });
		await save(zurichToday(-1), { mood: 4, sections: {}, free: 'gestern' });
		await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
		await c.api(`/api/entry/${zurichToday(-2)}/lock`, { locked: true });
		await c.api('/api/pin', undefined, 'DELETE');

		let html = await (await c.get('/stats')).text();
		assert.equal(tile(html, 'Einträge'), '2');
		assert.equal(tile(html, 'Aktuelle Serie'), '2 Tage');
		assert.match(tile(html, 'Ø Stimmung'), /^4[.,]0/);
		assert.equal(tile(html, 'Ø Energie'), '–');
		assert.match(html, /1 gesperrter Eintrag zählt nur bei Serien und Anzahl mit/);
		assert.doesNotMatch(html, /Freude/, 'feelings of the locked entry stay hidden');

		await c.api('/api/pin', { pin: PIN });
		html = await (await c.get('/stats')).text();
		assert.match(tile(html, 'Ø Stimmung'), /^3[.,]0/);
		assert.match(tile(html, 'Ø Energie'), /^3[.,]0/);
		assert.doesNotMatch(html, /gesperrter Eintrag/);
		assert.match(html, /Freude/);
		assert.match(html, /Stress/);
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('streak and count: widget API, dashboard and statistics show the same values', async () => {
		const widget = await (await new Client(server.url).request('/api/widget', { headers: { authorization: `Bearer ${TOKEN}` } })).json();
		assert.deepEqual([widget.entries, widget.streak], [2, 2]);
		const dashboard = await (await c.get('/')).text();
		assert.equal(dashboardValue(dashboard, 'Aktuelle Serie'), '2 Tage');
		assert.equal(dashboardValue(dashboard, 'Einträge'), '2');
		assert.match(dashboardValue(dashboard, 'Ø Stimmung 30 Tage'), /^4[.,]0/, 'a locked day without PIN is not in the mood');
		assert.match(dashboard, /href="\/stats"/);
		assert.doesNotMatch(dashboard, /Stimmungsverlauf/, 'mood chart only in the statistics');
		const stats = await (await c.get('/stats')).text();
		assert.equal(tile(stats, 'Aktuelle Serie'), '2 Tage');
	});

	test('mood chart in the statistics, no longer in the insights; months newest first', async () => {
		const html = await (await c.get('/stats?period=all')).text();
		assert.match(html, /<h2[^>]*>Stimmungsverlauf<\/h2>/);
		const labels = [...html.matchAll(/class="month-label[^"]*">([^<]+)</g)].map((m) => m[1]);
		const fmt = (iso: string) => new Intl.DateTimeFormat('de-CH', { month: 'short', timeZone: 'UTC' }).format(new Date(iso.slice(0, 7) + '-01T00:00:00Z'));
		assert.equal(labels[0], fmt(zurichToday()), 'current month on the left');
		assert.equal(labels.at(-1), fmt(zurichToday(-2)));
		assert.doesNotMatch(await (await c.get('/insights')).text(), /Stimmungsverlauf/);
	});

	test('period from the address, unknown values → 12 months', async () => {
		assert.match(await (await c.get('/stats?period=30')).text(), /aria-current="page"[^>]*>\s*30 Tage/);
		assert.match(await (await c.get('/stats?period=x')).text(), /aria-current="page"[^>]*>\s*12 Monate/);
	});

	test('redirected to the sign-in without signing in', async () => {
		const res = await new Client(server.url).get('/stats');
		assert.equal(res.status, 303);
		assert.equal(res.headers.get('location'), '/login');
	});
});
