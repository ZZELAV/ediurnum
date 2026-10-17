/**
 * Area 4: insights – creating the AI file, pasting the answer, focus points, own instructions.
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

describe('Preview', () => {
	test('counts shared, locked and excluded entries', async () => {
		const r = await c.api(`/api/ai/preview?from=${FROM}&to=${TO}`);
		assert.deepEqual(r.json, { send: 1, locked: 1, pinOpen: false, excluded: 1 });
		assert.equal((await c.api('/api/ai/preview?from=x&to=y')).status, 400);
		assert.equal((await new Client(server.url).api(`/api/ai/preview?from=${FROM}&to=${TO}`)).status, 401);
	});
});

describe('AI file', () => {
	test('contains only shared, readable entries in the period', async () => {
		const r = await prompt({ question: 'Wie geht es mir?' });
		assert.equal(r.type, 'success');
		const md = String(r.data!.markdown);
		assert.equal(r.data!.count, 1);
		assert.equal(r.data!.filename, `ediurnum-${FROM}_${TO}.md`);
		assert.match(md, /Normaler Tag/);
		assert.match(md, /\\# Überschrift im Eintrag/, 'heading in the entry escaped');
		assert.match(md, /Wie geht es mir\?/);
		assert.match(md, /genau 3 kurze/);
		for (const absent of ['Vor dem Zeitraum', 'Nicht für die KI', 'Geheim', 'Geleert']) assert.doesNotMatch(md, new RegExp(absent));
		// the mood chart is in the statistics, not here
		assert.equal(r.data!.moods, undefined);
		assert.doesNotMatch(md, /2026-03-05|5. März/);
	});

	test('locked shared entries only with an open PIN', async () => {
		await c.api('/api/pin', { pin: PIN });
		const r = await prompt();
		await c.api('/api/pin', undefined, 'DELETE');
		assert.equal(r.data!.count, 2);
		assert.match(String(r.data!.markdown), /Geheim, aber freigegeben/);
	});

	test('self-assessment only if wanted', async () => {
		const without = String((await prompt()).data!.markdown);
		const withProfile = String((await prompt({ profile: 'on' })).data!.markdown);
		assert.doesNotMatch(without, /Über mich/);
		assert.match(withProfile, /## Über mich \(Selbsteinschätzung\)/);
		assert.match(withProfile, /Testperson/);
	});

	test('invalid or empty period', async () => {
		assert.equal((await prompt({ from: '2026-03-31', to: '2026-03-01' })).data?.error, 'common.error');
		assert.equal((await prompt({ from: 'gestern' })).status, 400);
		assert.equal((await prompt({ from: '2025-01-01', to: '2025-01-31' })).data?.error, 'insights.noEntries');
	});

	test('contents do not end up in the log', async () => {
		assert.match(await server.waitForOutput(/AI file created/), /AI file created/);
		assert.doesNotMatch(server.output(), /Normaler Tag|Wie geht es mir/);
	});
});

describe('Own instructions', () => {
	test('is saved, used in the file and can be reset', async () => {
		const saved = await c.action('/insights?/instructions', { instructions: 'Fasse dich kurz.' });
		assert.equal(saved.data?.instructionsSaved, 'custom');
		const md = String((await prompt()).data!.markdown);
		assert.match(md, /Fasse dich kurz\./);
		assert.doesNotMatch(md, /reflektierender Begleiter/);
		assert.match(md, /## Fokuspunkte/, 'the focus section is always added');
		const reset = await c.action('/insights?/instructions', { instructions: 'egal', reset: 'reset' });
		assert.equal(reset.data?.instructionsSaved, 'default');
		assert.match(String((await prompt()).data!.markdown), /reflektierender Begleiter/);
	});

	test('the unchanged default does not count as own instructions', async () => {
		const md = String((await prompt()).data!.markdown);
		const standard = md.split('## Dein Auftrag\n\n')[1].split('\n\nSei wertschätzend')[0].replace(/^- `## (.+)`$/gm, '## $1');
		assert.equal((await c.action('/insights?/instructions', { instructions: standard })).data?.instructionsSaved, 'default');
	});
});

describe('Answer of the AI', () => {
	const answer = '## Überblick\nDu schläfst gut.\n\n## Fokuspunkte\n- Früher ins Bett\n- Spazieren\n- Spazieren';

	test('is stored encrypted; focus points appear on the dashboard', async () => {
		const r = await c.action('/insights?/import', { from: FROM, to: TO, count: '1', question: 'Schlaf?', answer });
		assert.equal(r.type, 'success');
		assert.equal(r.data!.focusCount, 2, 'a duplicate point is dropped');
		const home = await (await c.get('/')).text();
		assert.match(home, /Früher ins Bett/);
		const page = await (await c.get('/insights')).text();
		assert.match(page, /Du schläfst gut\./);
		assert.match(page, /Aktueller Fokus/);
		const wal = readFileSync(join(server.dataDir, 'ediurnum.db-wal'));
		assert.ok(!wal.includes(Buffer.from('Früher ins Bett')), 'no plain text in the database');
	});

	test('HTML in the answer is not executed', async () => {
		await c.action('/insights?/import', { from: FROM, to: TO, count: '1', answer: 'Hallo <img src=x onerror=alert(1)> [x](javascript:alert(1))' });
		const page = await (await c.get('/insights')).text();
		assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/);
		assert.doesNotMatch(page, /<img src=x/);
		assert.doesNotMatch(page, /href="javascript:/);
	});

	test('an answer without focus points keeps the previous focus', async () => {
		const home = await (await c.get('/')).text();
		assert.match(home, /Früher ins Bett/);
	});

	test('an empty answer and an invalid period are rejected', async () => {
		assert.equal((await c.action('/insights?/import', { from: FROM, to: TO, answer: '   ' })).data?.error, 'insights.answerEmpty');
		assert.equal((await c.action('/insights?/import', { from: 'x', to: TO, answer: 'a' })).data?.error, 'common.error');
	});

	test('unpin the focus, pin it again, delete the analysis', async () => {
		// IDs appear as anchors in the HTML of the insights, newest first
		const ids = () => [...pageHtml.matchAll(/id="a-([0-9a-f-]{36})"/g)].map((m) => m[1]);
		let pageHtml = await (await c.get('/insights')).text();
		const [newest, first] = ids();
		assert.equal(ids().length, 2);
		await c.action('/insights?/pin', { id: '' });
		assert.doesNotMatch(await (await c.get('/')).text(), /Früher ins Bett/);
		await c.action('/insights?/pin', { id: first });
		assert.match(await (await c.get('/')).text(), /Früher ins Bett/);
		await c.action('/insights?/delete', { id: first });
		assert.doesNotMatch(await (await c.get('/')).text(), /Früher ins Bett/, 'a deleted analysis is no longer the focus');
		pageHtml = await (await c.get('/insights')).text();
		assert.deepEqual(ids(), [newest]);
	});
});
