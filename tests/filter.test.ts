import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilter, matchesFilter } from '../src/lib/filter.ts';

const none = emptyFilter();
const day = { mood: 2, energy: 4, kinds: ['daily', 'feelings'], emotions: ['tired', 'stressed'] };
const locked = { mood: null, energy: null, kinds: ['daily', 'growth'], emotions: [] };
const noReview = { mood: 3, energy: null, kinds: ['daily'], emotions: [] };

test('without a selection every day matches', () => {
	assert.equal(matchesFilter(day, none), true);
	assert.equal(matchesFilter(locked, none), true);
});

test('within a group one match is enough', () => {
	assert.equal(matchesFilter(day, { ...none, moods: [1, 2] }), true);
	assert.equal(matchesFilter(day, { ...none, moods: [4, 5] }), false);
	assert.equal(matchesFilter(day, { ...none, energies: [4, 5] }), true);
	assert.equal(matchesFilter(day, { ...none, energies: [1, 2] }), false);
	assert.equal(matchesFilter(day, { ...none, kinds: ['feelings', 'growth'] }), true);
	assert.equal(matchesFilter(day, { ...none, kinds: ['growth'] }), false);
	assert.equal(matchesFilter(day, { ...none, emotions: ['joy', 'stressed'] }), true);
	assert.equal(matchesFilter(day, { ...none, emotions: ['joy'] }), false);
});

test('all selected groups have to match', () => {
	assert.equal(matchesFilter(day, { moods: [2], energies: [4], kinds: ['feelings'], emotions: ['tired'] }), true);
	assert.equal(matchesFilter(day, { moods: [2], energies: [3], kinds: ['feelings'], emotions: ['tired'] }), false);
	assert.equal(matchesFilter(day, { moods: [2], energies: [], kinds: ['growth'], emotions: ['tired'] }), false);
	assert.equal(matchesFilter(day, { moods: [3], energies: [], kinds: ['feelings'], emotions: [] }), false);
});

test('energy only matches days with a weekly review', () => {
	assert.equal(matchesFilter(noReview, { ...none, energies: [1, 2, 3, 4, 5] }), false);
	assert.equal(matchesFilter(noReview, { ...none, moods: [3] }), true);
});

test('a day without mood or feelings (e.g. locked without PIN) only matches reviews', () => {
	assert.equal(matchesFilter(locked, { ...none, moods: [1, 2, 3, 4, 5] }), false);
	assert.equal(matchesFilter(locked, { ...none, energies: [1, 2, 3, 4, 5] }), false);
	assert.equal(matchesFilter(locked, { ...none, emotions: ['joy'] }), false);
	assert.equal(matchesFilter(locked, { ...none, kinds: ['growth'] }), true);
});
