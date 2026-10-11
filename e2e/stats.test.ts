/**
 * Statistik: Seite, Zeitraum und gesperrte Einträge (Berechnung im Detail: tests/stats.test.ts).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PIN, setupJournal, startServer, zurichToday, type TestServer } from './helpers.ts';

const TOKEN = 'w'.repeat(40);
/** Text ohne Kommentare und Tags. */
const strip = (html: string) => html.replace(/<!--[\s\S]*?-->|<[^>]+>/g, '').trim();

/** Wert unter einer Beschriftung auf dem Dashboard (`<dt>` → `<dd>`). */
function dashboardValue(html: string, label: string) {
	const i = html.search(new RegExp(`<dt class="eyebrow[^"]*">${label}</dt>`));
	assert.ok(i >= 0, `Dashboard: ${label} fehlt`);
	return strip(html.slice(i).match(/<dd[^>]*>([\s\S]*?)<\/dd>/)![1]);
}

/** Text einer Kachel in der Statistik, z. B. „4.0“ unter „Ø Stimmung“. */
function tile(html: string, label: string) {
	const i = html.search(new RegExp(`class="eyebrow[^"]*">${label}</span>`));
	assert.ok(i >= 0, `Kachel ${label} fehlt`);
	return strip(html.slice(i).match(/<strong[^>]*>([\s\S]*?)<\/strong>/)![1]);
}

describe('Statistik', () => {
	let server: TestServer;
	let c: Client;
	before(async () => {
		server = await startServer({ WIDGET_TOKEN: TOKEN });
		({ client: c } = await setupJournal(server));
	});
	after(() => server.stop());

	test('leeres Tagebuch', async () => {
		const res = await c.get('/stats');
		assert.equal(res.status, 200);
		assert.match(await res.text(), /Noch keine Einträge/);
	});

	test('in der Navigation, Einstellungen weiterhin erreichbar', async () => {
		const html = await (await c.get('/')).text();
		assert.match(html, /href="\/stats"/);
		assert.match(html, /href="\/settings"/);
	});

	test('Kennzahlen; gesperrte Einträge zählen ohne PIN nur bei Anzahl, Serien und Rückblicken', async () => {
		const save = (date: string, content: unknown) => c.api(`/api/entry/${date}`, { content });
		await save(zurichToday(-2), { mood: 2, sections: { gefuehl: { energy: 3, emotions: ['joy', 'stressed'] } }, free: '' });
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
		assert.doesNotMatch(html, /Freude/, 'Gefühle des gesperrten Eintrags bleiben verborgen');

		await c.api('/api/pin', { pin: PIN });
		html = await (await c.get('/stats')).text();
		assert.match(tile(html, 'Ø Stimmung'), /^3[.,]0/);
		assert.match(tile(html, 'Ø Energie'), /^3[.,]0/);
		assert.doesNotMatch(html, /gesperrter Eintrag/);
		assert.match(html, /Freude/);
		assert.match(html, /Stress/);
		await c.api('/api/pin', undefined, 'DELETE');
	});

	test('Serie und Anzahl: Widget-API, Dashboard und Statistik zeigen dieselben Werte', async () => {
		const widget = await (await new Client(server.url).request('/api/widget', { headers: { authorization: `Bearer ${TOKEN}` } })).json();
		assert.deepEqual([widget.entries, widget.streak], [2, 2]);
		const dashboard = await (await c.get('/')).text();
		assert.equal(dashboardValue(dashboard, 'Aktuelle Serie'), '2 Tage');
		assert.equal(dashboardValue(dashboard, 'Einträge'), '2');
		assert.match(dashboardValue(dashboard, 'Ø Stimmung 30 Tage'), /^4[.,]0/, 'gesperrter Tag ohne PIN nicht in der Stimmung');
		assert.match(dashboard, /href="\/stats"/);
		assert.doesNotMatch(dashboard, /Stimmungsverlauf/, 'Verlauf nur noch in der Statistik');
		const stats = await (await c.get('/stats')).text();
		assert.equal(tile(stats, 'Aktuelle Serie'), '2 Tage');
	});

	test('Stimmungsverlauf in der Statistik, nicht mehr bei den Einsichten; Monate neuester zuerst', async () => {
		const html = await (await c.get('/stats?period=all')).text();
		assert.match(html, /<h2[^>]*>Stimmungsverlauf<\/h2>/);
		const labels = [...html.matchAll(/class="month-label[^"]*">([^<]+)</g)].map((m) => m[1]);
		const fmt = (iso: string) => new Intl.DateTimeFormat('de-CH', { month: 'short', timeZone: 'UTC' }).format(new Date(iso.slice(0, 7) + '-01T00:00:00Z'));
		assert.equal(labels[0], fmt(zurichToday()), 'laufender Monat links');
		assert.equal(labels.at(-1), fmt(zurichToday(-2)));
		assert.doesNotMatch(await (await c.get('/insights')).text(), /Stimmungsverlauf/);
	});

	test('Zeitraum aus der Adresse, unbekannte Werte → 12 Monate', async () => {
		assert.match(await (await c.get('/stats?period=30')).text(), /aria-current="page"[^>]*>\s*30 Tage/);
		assert.match(await (await c.get('/stats?period=x')).text(), /aria-current="page"[^>]*>\s*12 Monate/);
	});

	test('ohne Anmeldung zur Anmeldung umgeleitet', async () => {
		const res = await new Client(server.url).get('/stats');
		assert.equal(res.status, 303);
		assert.equal(res.headers.get('location'), '/login');
	});
});
