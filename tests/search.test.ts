import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchEntry, searchTerms } from '../src/lib/search.ts';
import type { EntryContent } from '../src/lib/types.ts';

const t = (key: string) => (key === 'emotion.joy' ? 'Freude' : key);

const entry: EntryContent = {
	mood: 4,
	sections: {
		daily: { gratitude: ['Kaffee im Café am See', ''], highlight: 'Sonnenuntergang' },
		feelings: { emotions: ['joy'] }
	},
	free: 'Lange mit Anna telefoniert.'
};

const text = (hit: ReturnType<typeof matchEntry>) => hit!.parts.map((p) => p.text).join('');
const marked = (hit: ReturnType<typeof matchEntry>) => hit!.parts.filter((p) => p.hit).map((p) => p.text);

test('search ignores case and accents', () => {
	const hit = matchEntry(entry, searchTerms('CAFE'), t);
	assert.equal(hit?.field, 'section.daily.gratitude');
	assert.deepEqual(marked(hit), ['Café']);
});

test('all terms have to occur, also in different fields', () => {
	assert.ok(matchEntry(entry, searchTerms('see anna'), t));
	assert.equal(matchEntry(entry, searchTerms('see berge'), t), null);
});

test('feelings are found in the language of the app', () => {
	const hit = matchEntry(entry, searchTerms('freude'), t);
	assert.equal(hit?.field, 'section.feelings.emotions');
});

test('long texts are shortened around the match', () => {
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

test('„ss“ and „ß“ count as equal, the highlight hits the original', () => {
	const c: EntryContent = { mood: null, sections: {}, free: 'Über die Straße gegangen.' };
	assert.deepEqual(marked(matchEntry(c, searchTerms('strasse'), t)), ['Straße']);
	assert.deepEqual(marked(matchEntry(c, searchTerms('STRAẞE'), t)), ['Straße']);
	assert.deepEqual(marked(matchEntry(c, searchTerms('uber'), t)), ['Über']);
});

test('decomposed accents in the text are highlighted completely', () => {
	const c: EntryContent = { mood: null, sections: {}, free: 'Im Café gesessen' };
	assert.deepEqual(marked(matchEntry(c, searchTerms('café'), t)), ['Café']);
});

test('all matches in the excerpt are highlighted, short text without an ellipsis', () => {
	const c: EntryContent = { mood: null, sections: {}, free: 'See, dann\n\nwieder  See und Berge' };
	const hit = matchEntry(c, searchTerms('see berge'), t);
	assert.equal(text(hit), 'See, dann wieder See und Berge');
	assert.deepEqual(marked(hit), ['See', 'See', 'Berge']);
});

test('search terms: duplicates removed, at most eight', () => {
	assert.deepEqual(searchTerms('See see SEE'), ['see']);
	assert.equal(searchTerms('a b c d e f g h i j').length, 8);
});

test('empty fields and lists give no match', () => {
	const c: EntryContent = { mood: 3, sections: { daily: { gratitude: ['', ' '], highlight: '  ' } }, free: '' };
	assert.equal(matchEntry(c, searchTerms('a'), t), null);
});
