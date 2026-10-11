import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, addYears, daysBetween, isIsoDate, monthKey, todayIso, weekdayOf } from '../src/lib/dates.ts';

test('Gültige Kalenderdaten', () => {
	assert.ok(isIsoDate('2026-10-10'));
	assert.ok(isIsoDate('2028-02-29'));
	for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-10-32', '2026-1-1', '10.10.2026', '2026-10-10T00:00', '', ' 2026-10-10']) {
		assert.equal(isIsoDate(bad), false, bad);
	}
});

test('Heute in der lokalen Zeitzone, nicht in UTC', () => {
	// 23:30 Uhr am 10. Oktober lokal ist in UTC teilweise schon der 11. – massgebend ist das lokale Datum
	assert.equal(todayIso(new Date(2026, 9, 10, 23, 30)), '2026-10-10');
	assert.equal(todayIso(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
});

test('Tage addieren und Abstände über Monats-, Jahres- und Zeitumstellungsgrenzen', () => {
	assert.equal(addDays('2026-10-31', 1), '2026-11-01');
	assert.equal(addDays('2026-01-01', -1), '2025-12-31');
	assert.equal(addDays('2028-02-28', 1), '2028-02-29');
	assert.equal(addDays('2026-03-28', 2), '2026-03-30', 'Sommerzeit-Beginn');
	assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
	assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, 'Winterzeit-Beginn');
	assert.equal(daysBetween('2026-10-10', '2026-10-01'), -9);
	assert.equal(daysBetween('2025-10-10', '2026-10-10'), 365);
});

test('Monat und gleicher Tag in einem anderen Jahr', () => {
	assert.equal(monthKey('2026-10-10'), '2026-10');
	assert.equal(addYears('2026-10-09', -1), '2025-10-09');
	assert.equal(addYears('2028-02-29', -1), '2027-02-28');
	assert.equal(addYears('2027-02-28', -3), '2024-02-28');
});

test('Wochentag (0 = Sonntag) und Monate verschieben', () => {
	assert.equal(weekdayOf('2026-10-11'), 0);
	assert.equal(weekdayOf('2026-10-12'), 1);
	assert.equal(weekdayOf('2028-02-29'), 2);
	assert.equal(addMonths('2026-10', -1), '2026-09');
	assert.equal(addMonths('2026-01', -1), '2025-12');
	assert.equal(addMonths('2025-12', 1), '2026-01');
	assert.equal(addMonths('2026-10', -22), '2024-12');
	assert.equal(addMonths('2026-10', 15), '2028-01');
});
