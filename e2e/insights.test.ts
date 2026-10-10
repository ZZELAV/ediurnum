/**
 * Bereich 4: Einsichten – KI-Datei erstellen, Antwort einfügen, Fokuspunkte, eigener Auftrag.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, PIN, setupJournal, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let c: Client;

const FROM = '2026-03-01';
const TO = '2026-03-31';

async function prompt(fields: Record<string, string> = {}) {
	return c.action('/insights?/prompt', { from: FROM, to: TO, tone: 'balanced', focusCount: '3', question: '', ...fields });
}

before(async () => {
	server = await startServer();
	({ client: c } = await setupJournal(server));
	const save = (date: string, free: string, mood: number | null = 3) =>
		c.api(`/api/entry/${date}`, { content: { mood, sections: {}, free } });
	await save('2026-02-28', 'Vor dem Zeitraum');
	await save('2026-03-02', '# Überschrift im Eintrag\nNormaler Tag', 4);
	await save('2026-03-05', 'Nicht für die KI');
	await c.api('/api/entry/2026-03-05/ai', { allowed: false });
	await save('2026-03-09', 'Geheim, aber freigegeben', 2);
	await save('2026-03-12', 'Geleert');
	await save('2026-03-12', '', null);
	await c.action('/settings?/pin', { pin: PIN, confirm: PIN });
	await c.api('/api/entry/2026-03-09/lock', { locked: true });
	await c.api('/api/entry/2026-03-09/ai', { allowed: true });
	await c.api('/api/pin', undefined, 'DELETE');
});
after(() => server.stop());

describe('Vorschau', () => {
	test('zählt freigegebene, gesperrte und ausgeschlossene Einträge', async () => {
		const r = await c.api(`/api/ai/preview?from=${FROM}&to=${TO}`);
		assert.deepEqual(r.json, { send: 1, locked: 1, pinOpen: false, excluded: 1 });
		assert.equal((await c.api('/api/ai/preview?from=x&to=y')).status, 400);
		assert.equal((await new Client(server.url).api(`/api/ai/preview?from=${FROM}&to=${TO}`)).status, 401);
	});
});

describe('KI-Datei', () => {
	test('enthält nur freigegebene, lesbare Einträge im Zeitraum', async () => {
		const r = await prompt({ question: 'Wie geht es mir?' });
		assert.equal(r.type, 'success');
		const md = String(r.data!.markdown);
		assert.equal(r.data!.count, 1);
		assert.equal(r.data!.filename, `ediurnum-${FROM}_${TO}.md`);
		assert.match(md, /Normaler Tag/);
		assert.match(md, /\\# Überschrift im Eintrag/, 'Überschrift im Eintrag entschärft');
		assert.match(md, /Wie geht es mir\?/);
		assert.match(md, /genau 3 kurze/);
		for (const absent of ['Vor dem Zeitraum', 'Nicht für die KI', 'Geheim', 'Geleert']) assert.doesNotMatch(md, new RegExp(absent));
		// Der Stimmungsverlauf bleibt in der App (nicht in der Datei): alle lesbaren Tage, ohne gesperrte
		assert.deepEqual(r.data!.moods, [{ date: '2026-03-02', mood: 4 }, { date: '2026-03-05', mood: 3 }]);
		assert.doesNotMatch(md, /2026-03-05|5. März/);
	});

	test('gesperrte freigegebene Einträge nur mit offener PIN', async () => {
		await c.api('/api/pin', { pin: PIN });
		const r = await prompt();
		await c.api('/api/pin', undefined, 'DELETE');
		assert.equal(r.data!.count, 2);
		assert.match(String(r.data!.markdown), /Geheim, aber freigegeben/);
	});

	test('Selbsteinschätzung nur, wenn gewünscht', async () => {
		const without = String((await prompt()).data!.markdown);
		const withProfile = String((await prompt({ profile: 'on' })).data!.markdown);
		assert.doesNotMatch(without, /Über mich/);
		assert.match(withProfile, /## Über mich \(Selbsteinschätzung\)/);
		assert.match(withProfile, /Testperson/);
	});

	test('ungültiger oder leerer Zeitraum', async () => {
		assert.equal((await prompt({ from: '2026-03-31', to: '2026-03-01' })).data?.error, 'common.error');
		assert.equal((await prompt({ from: 'gestern' })).status, 400);
		assert.equal((await prompt({ from: '2025-01-01', to: '2025-01-31' })).data?.error, 'insights.noEntries');
	});

	test('Inhalte landen nicht im Log', async () => {
		assert.match(server.output(), /AI file created/);
		assert.doesNotMatch(server.output(), /Normaler Tag|Wie geht es mir/);
	});
});

describe('Eigener Auftrag', () => {
	test('wird gespeichert, in der Datei verwendet und lässt sich zurücksetzen', async () => {
		const saved = await c.action('/insights?/instructions', { instructions: 'Fasse dich kurz.' });
		assert.equal(saved.data?.instructionsSaved, 'custom');
		const md = String((await prompt()).data!.markdown);
		assert.match(md, /Fasse dich kurz\./);
		assert.doesNotMatch(md, /reflektierender Begleiter/);
		assert.match(md, /## Fokuspunkte/, 'Fokus-Abschnitt wird immer ergänzt');
		const reset = await c.action('/insights?/instructions', { instructions: 'egal', reset: 'reset' });
		assert.equal(reset.data?.instructionsSaved, 'default');
		assert.match(String((await prompt()).data!.markdown), /reflektierender Begleiter/);
	});

	test('der unveränderte Standard gilt nicht als eigener Auftrag', async () => {
		const md = String((await prompt()).data!.markdown);
		const standard = md.split('## Dein Auftrag\n\n')[1].split('\n\nSei wertschätzend')[0].replace(/^- `## (.+)`$/gm, '## $1');
		assert.equal((await c.action('/insights?/instructions', { instructions: standard })).data?.instructionsSaved, 'default');
	});
});

describe('Antwort der KI', () => {
	const answer = '## Überblick\nDu schläfst gut.\n\n## Fokuspunkte\n- Früher ins Bett\n- Spazieren\n- Spazieren';

	test('wird verschlüsselt gespeichert; Fokuspunkte erscheinen auf dem Dashboard', async () => {
		const r = await c.action('/insights?/import', { from: FROM, to: TO, count: '1', question: 'Schlaf?', answer });
		assert.equal(r.type, 'success');
		assert.equal(r.data!.focusCount, 2, 'doppelter Punkt entfällt');
		const home = await (await c.get('/')).text();
		assert.match(home, /Früher ins Bett/);
		const page = await (await c.get('/insights')).text();
		assert.match(page, /Du schläfst gut\./);
		assert.match(page, /Aktueller Fokus/);
		const wal = readFileSync(join(server.dataDir, 'ediurnum.db-wal'));
		assert.ok(!wal.includes(Buffer.from('Früher ins Bett')), 'kein Klartext in der Datenbank');
	});

	test('HTML in der Antwort wird nicht ausgeführt', async () => {
		await c.action('/insights?/import', { from: FROM, to: TO, count: '1', answer: 'Hallo <img src=x onerror=alert(1)> [x](javascript:alert(1))' });
		const page = await (await c.get('/insights')).text();
		assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/);
		assert.doesNotMatch(page, /<img src=x/);
		assert.doesNotMatch(page, /href="javascript:/);
	});

	test('Antwort ohne Fokuspunkte lässt den bisherigen Fokus stehen', async () => {
		const home = await (await c.get('/')).text();
		assert.match(home, /Früher ins Bett/);
	});

	test('leere Antwort und ungültiger Zeitraum werden abgelehnt', async () => {
		assert.equal((await c.action('/insights?/import', { from: FROM, to: TO, answer: '   ' })).data?.error, 'insights.answerEmpty');
		assert.equal((await c.action('/insights?/import', { from: 'x', to: TO, answer: 'a' })).data?.error, 'common.error');
	});

	test('Fokus lösen, wieder festlegen, Auswertung löschen', async () => {
		// IDs stehen als Anker im HTML der Einsichten, neueste zuerst
		const ids = () => [...pageHtml.matchAll(/id="a-([0-9a-f-]{36})"/g)].map((m) => m[1]);
		let pageHtml = await (await c.get('/insights')).text();
		const [newest, first] = ids();
		assert.equal(ids().length, 2);
		await c.action('/insights?/pin', { id: '' });
		assert.doesNotMatch(await (await c.get('/')).text(), /Früher ins Bett/);
		await c.action('/insights?/pin', { id: first });
		assert.match(await (await c.get('/')).text(), /Früher ins Bett/);
		await c.action('/insights?/delete', { id: first });
		assert.doesNotMatch(await (await c.get('/')).text(), /Früher ins Bett/, 'gelöschte Auswertung ist kein Fokus mehr');
		pageHtml = await (await c.get('/insights')).text();
		assert.deepEqual(ids(), [newest]);
	});
});
