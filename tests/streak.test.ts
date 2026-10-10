import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak } from '../src/lib/streak.ts';

test('Serie mit heutigem Eintrag', () => {
	assert.equal(currentStreak(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-06'], '2026-10-10'), 3);
});

test('Heute noch nicht geschrieben: Serie zählt bis gestern', () => {
	assert.equal(currentStreak(['2026-10-09', '2026-10-08'], '2026-10-10'), 2);
});

test('Gestern ausgelassen: keine Serie', () => {
	assert.equal(currentStreak(['2026-10-08', '2026-10-07'], '2026-10-10'), 0);
	assert.equal(currentStreak([], '2026-10-10'), 0);
});

test('Über Monats- und Jahresgrenzen', () => {
	assert.equal(currentStreak(['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30'], '2026-01-02'), 4);
	assert.equal(currentStreak(['2026-03-01', '2026-02-28'], '2026-03-01'), 2);
});
