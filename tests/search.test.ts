import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchEntry, searchTerms } from '../src/lib/search.ts';
import type { EntryContent } from '../src/lib/types.ts';

const t = (key: string) => (key === 'emotion.joy' ? 'Freude' : key);

const entry: EntryContent = {
	mood: 4,
	sections: {
		erlebt: { gratitude: ['Kaffee im Café am See', ''], highlight: 'Sonnenuntergang' },
		gefuehl: { emotions: ['joy'] }
	},
	free: 'Lange mit Anna telefoniert.'
};

const text = (hit: ReturnType<typeof matchEntry>) => hit!.parts.map((p) => p.text).join('');
const marked = (hit: ReturnType<typeof matchEntry>) => hit!.parts.filter((p) => p.hit).map((p) => p.text);

test('Suche ignoriert Gross-/Kleinschreibung und Akzente', () => {
	const hit = matchEntry(entry, searchTerms('CAFE'), t);
	assert.equal(hit?.field, 'section.erlebt.gratitude');
	assert.deepEqual(marked(hit), ['Café']);
});

test('Alle Begriffe müssen vorkommen, auch in verschiedenen Feldern', () => {
	assert.ok(matchEntry(entry, searchTerms('see anna'), t));
	assert.equal(matchEntry(entry, searchTerms('see berge'), t), null);
});

test('Gefühle werden in der Sprache der App gefunden', () => {
	const hit = matchEntry(entry, searchTerms('freude'), t);
	assert.equal(hit?.field, 'section.gefuehl.emotions');
});

test('Lange Texte werden um die Fundstelle gekürzt', () => {
	const long: EntryContent = { mood: null, sections: {}, free: 'wort '.repeat(60) + 'Treffer ' + 'wort '.repeat(60) };
	const hit = matchEntry(long, searchTerms('treffer'), t);
	assert.ok(text(hit).startsWith('… '));
	assert.ok(text(hit).endsWith(' …'));
	assert.deepEqual(marked(hit), ['Treffer']);
});

test('Leere Suche findet nichts', () => {
	assert.deepEqual(searchTerms('   '), []);
	assert.equal(matchEntry(entry, [], t), null);
});

test('„ss“ und „ß“ gelten als gleich, die Markierung trifft das Original', () => {
	const c: EntryContent = { mood: null, sections: {}, free: 'Über die Straße gegangen.' };
	assert.deepEqual(marked(matchEntry(c, searchTerms('strasse'), t)), ['Straße']);
	assert.deepEqual(marked(matchEntry(c, searchTerms('STRAẞE'), t)), ['Straße']);
	assert.deepEqual(marked(matchEntry(c, searchTerms('uber'), t)), ['Über']);
});

test('Zerlegte Akzente im Text werden ganz markiert', () => {
	const c: EntryContent = { mood: null, sections: {}, free: 'Im Café gesessen' };
	assert.deepEqual(marked(matchEntry(c, searchTerms('café'), t)), ['Café']);
});

test('Alle Fundstellen im Auszug sind markiert, kurzer Text ohne Auslassung', () => {
	const c: EntryContent = { mood: null, sections: {}, free: 'See, dann\n\nwieder  See und Berge' };
	const hit = matchEntry(c, searchTerms('see berge'), t);
	assert.equal(text(hit), 'See, dann wieder See und Berge');
	assert.deepEqual(marked(hit), ['See', 'See', 'Berge']);
});

test('Suchbegriffe: doppelte entfernt, höchstens acht', () => {
	assert.deepEqual(searchTerms('See see SEE'), ['see']);
	assert.equal(searchTerms('a b c d e f g h i j').length, 8);
});

test('Leere Felder und Listen ergeben keinen Treffer', () => {
	const c: EntryContent = { mood: 3, sections: { erlebt: { gratitude: ['', ' '], highlight: '  ' } }, free: '' };
	assert.equal(matchEntry(c, searchTerms('a'), t), null);
});
