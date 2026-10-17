import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, type DayFilter } from '../src/lib/filter.ts';

const none: DayFilter = { moods: [], kinds: [], emotions: [] };
const day = { mood: 2, kinds: ['daily', 'feelings'], emotions: ['tired', 'stressed'] };
const locked = { mood: null, kinds: ['daily', 'growth'], emotions: [] };

test('Ohne Auswahl passt jeder Tag', () => {
	assert.equal(matchesFilter(day, none), true);
	assert.equal(matchesFilter(locked, none), true);
});

test('Innerhalb einer Gruppe genügt ein Treffer', () => {
	assert.equal(matchesFilter(day, { ...none, moods: [1, 2] }), true);
	assert.equal(matchesFilter(day, { ...none, moods: [4, 5] }), false);
	assert.equal(matchesFilter(day, { ...none, kinds: ['feelings', 'growth'] }), true);
	assert.equal(matchesFilter(day, { ...none, kinds: ['growth'] }), false);
	assert.equal(matchesFilter(day, { ...none, emotions: ['joy', 'stressed'] }), true);
	assert.equal(matchesFilter(day, { ...none, emotions: ['joy'] }), false);
});

test('Alle gewählten Gruppen müssen passen', () => {
	assert.equal(matchesFilter(day, { moods: [2], kinds: ['feelings'], emotions: ['tired'] }), true);
	assert.equal(matchesFilter(day, { moods: [2], kinds: ['growth'], emotions: ['tired'] }), false);
	assert.equal(matchesFilter(day, { moods: [3], kinds: ['feelings'], emotions: [] }), false);
});

test('Tag ohne Stimmung oder Gefühle (z. B. gesperrt ohne PIN) passt nur zu Rückblicken', () => {
	assert.equal(matchesFilter(locked, { ...none, moods: [1, 2, 3, 4, 5] }), false);
	assert.equal(matchesFilter(locked, { ...none, emotions: ['joy'] }), false);
	assert.equal(matchesFilter(locked, { ...none, kinds: ['growth'] }), true);
});
