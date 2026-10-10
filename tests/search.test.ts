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
