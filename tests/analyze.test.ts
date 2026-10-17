import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatMarkdown, defaultInstructions, parseResponse } from '../src/lib/server/ai/analyze.ts';
import type { Entry, EntryContent } from '../src/lib/types.ts';

const entry = (date: string, content: EntryContent): Entry => ({
	id: date,
	date,
	kinds: [],
	locked: false,
	aiAllowed: true,
	revision: 1,
	createdAt: '',
	updatedAt: '',
	content
});

const options = { tone: 'balanced' as const, persona: '', maxFocusPoints: 3, instructions: '' };

test('Antwort mit Abschnitt „## Fokuspunkte“ am Schluss', () => {
	const r = parseResponse('## Überblick\nGut.\n\n## Fokuspunkte\n- Mehr schlafen\n- **Sport** treiben\n3. Lesen\n');
	assert.deepEqual(r.focusPoints, ['Mehr schlafen', 'Sport treiben', 'Lesen']);
	assert.equal(r.body, '## Überblick\nGut.');
});

test('Überschrift mit Zusatz, fett oder ohne Markdown (markiert und kopiert)', () => {
	assert.deepEqual(parseResponse('Text\n\n## Fokuspunkte für die nächsten Wochen\n- A\n- B').focusPoints, ['A', 'B']);
	assert.deepEqual(parseResponse('Text\n\n**Fokuspunkte:**\n- A').focusPoints, ['A']);
	assert.deepEqual(parseResponse('Überblick\nText\n\nFokuspunkte\nMehr schlafen\nSport treiben').focusPoints, ['Mehr schlafen', 'Sport treiben']);
	assert.deepEqual(parseResponse('Overview\n\n### Focus points\n1) Sleep\n2) Run').focusPoints, ['Sleep', 'Run']);
});

test('Nur die letzte Fokus-Überschrift zählt; Erwähnungen im Text nicht', () => {
	const r = parseResponse('## Überblick\nDie Fokuspunkte vom letzten Mal hast du umgesetzt.\n\n## Fokuspunkte\n- Neu');
	assert.deepEqual(r.focusPoints, ['Neu']);
	assert.match(r.body, /Fokuspunkte vom letzten Mal/);
});

test('Folgt nach den Fokuspunkten noch ein Abschnitt, bleibt er im Text', () => {
	const r = parseResponse('## Fokuspunkte\n- A\n\n## Schlusswort\nAlles Gute');
	assert.deepEqual(r.focusPoints, ['A']);
	assert.equal(r.body, '## Schlusswort\nAlles Gute');
});

test('Doppelte Fokuspunkte entfallen, höchstens sieben', () => {
	assert.deepEqual(parseResponse('## Fokuspunkte\n- A\n- A\n- B').focusPoints, ['A', 'B']);
	const many = Array.from({ length: 10 }, (_, i) => `- P${i}`).join('\n');
	assert.equal(parseResponse(`## Fokuspunkte\n${many}`).focusPoints.length, 7);
});

test('<focus>-Block (KI-Agent) und Windows-Zeilenenden', () => {
	assert.deepEqual(parseResponse('Text\r\n<focus>\r\n- A\r\n- B\r\n</focus>').focusPoints, ['A', 'B']);
	assert.deepEqual(parseResponse('Text\r\n\r\n## Focus points\r\n- A\r\n').focusPoints, ['A']);
});

test('Ohne Fokuspunkte bleibt die ganze Antwort erhalten', () => {
	assert.deepEqual(parseResponse('  Nur Text  '), { body: 'Nur Text', focusPoints: [] });
	// leere Fokus-Überschrift: nichts abschneiden
	assert.deepEqual(parseResponse('Text\n\n## Fokuspunkte\n'), { body: 'Text\n\n## Fokuspunkte', focusPoints: [] });
});

test('KI-Datei: Auftrag, Ton, Anzahl Fokuspunkte, Einträge chronologisch mit Inhalt', () => {
	const md = buildChatMarkdown({
		options,
		lang: 'de',
		entries: [
			entry('2026-03-01', { mood: 4, sections: { daily: { gratitude: ['Kaffee', ''], experienced: 'Am See' }, feelings: { emotions: ['joy'] } }, free: 'Gedanken' }),
			entry('2026-03-02', { mood: null, sections: {}, free: 'Zweiter Tag' })
		],
		from: '2026-03-01',
		to: '2026-03-02',
		question: 'Wie schlafe ich?'
	});
	assert.ok(md.startsWith('# ediurnum – Tagebuch-Auswertung'));
	assert.match(md, /genau 3 kurze/);
	assert.match(md, /Bitte achte besonders auf Folgendes: Wie schlafe ich\?/);
	assert.match(md, /### Sonntag, 1\. März 2026/);
	assert.match(md, /Kaffee/);
	assert.match(md, /Am See/);
	assert.match(md, /Freude/);
	assert.ok(md.indexOf('Gedanken') < md.indexOf('Zweiter Tag'));
	// Standard-Überschriften der Antwort stehen als Code, nicht als echte Überschriften
	assert.doesNotMatch(md, /^## Überblick$/m);
	assert.ok(md.includes(defaultInstructions('de').split('\n')[0]));
});

test('KI-Datei: Überschriften im Tagebuchtext werden entschärft', () => {
	const md = buildChatMarkdown({
		options,
		lang: 'de',
		entries: [entry('2026-03-01', { mood: null, sections: {}, free: '# Mein Tag\n  ## Fokuspunkte\nText #hashtag' })],
		from: '2026-03-01',
		to: '2026-03-01',
		question: '# Frage'
	});
	assert.doesNotMatch(md, /^\s*#+ (Mein Tag|Fokuspunkte|Frage)/m);
	assert.match(md, /\\# Mein Tag/);
	assert.match(md, /Text #hashtag/);
});

test('KI-Datei auf Englisch mit eigenem Auftrag', () => {
	const md = buildChatMarkdown({
		options: { ...options, instructions: 'Be brief.' },
		lang: 'en',
		entries: [entry('2026-03-01', { mood: 5, sections: {}, free: 'Hello' })],
		from: '2026-03-01',
		to: '2026-03-01',
		question: ''
	});
	assert.ok(md.startsWith('# ediurnum – journal review'));
	assert.match(md, /Be brief\./);
	assert.doesNotMatch(md, /reflective companion/);
	assert.match(md, /## Focus points/);
});
