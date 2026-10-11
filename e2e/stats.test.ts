/**
 * Statistik: Seite, Zeitraum und gesperrte Einträge (Berechnung im Detail: tests/stats.test.ts).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PIN, setupJournal, startServer, type TestServer } from './helpers.ts';

function zurichToday(offset = 0) {
	const d = new Date(new Date().toLocaleString('sv', { timeZone: 'Europe/Zurich' }).slice(0, 10) + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + offset);
	return d.toISOString().slice(0, 10);
}

/** Text einer Kachel, z. B. „4.0“ unter „Ø Stimmung“ (Markup ohne Kommentare und Tags). */
function tile(html: string, label: string) {
	const i = html.search(new RegExp(`class="eyebrow[^"]*">${label}</span>`));
	assert.ok(i >= 0, `Kachel ${label} fehlt`);
	const strong = html.slice(i).match(/<strong[^>]*>([\s\S]*?)<\/strong>/)![1];
	return strong.replace(/<!--[\s\S]*?-->|<[^>]+>/g, '').trim();
}

describe('Statistik', () => {
	let server: TestServer;
	let c: Client;
	before(async () => {
		server = await startServer();
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
