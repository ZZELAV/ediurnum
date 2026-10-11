import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, periodStart, PLEASANT_EMOTIONS, type StatsDay } from '../src/lib/stats.ts';
import { EMOTIONS } from '../src/lib/templates.ts';

const day = (date: string, mood: number | null = null, extra: Partial<StatsDay> = {}): StatsDay => ({
	date,
	kinds: ['erlebt'],
	content: { mood, energy: null, emotions: [] },
	...extra
});
const locked = (date: string, kinds: StatsDay['kinds'] = ['erlebt']): StatsDay => ({ date, kinds, content: null });

test('Zeitraum: letzte 30/90/365 Tage inklusive heute, „Alles“ ab dem ersten Eintrag', () => {
	assert.equal(periodStart('30', '2026-10-11', '2025-01-01'), '2026-09-12');
	assert.equal(periodStart('90', '2026-10-11', null), '2026-07-14');
	assert.equal(periodStart('365', '2026-10-11', null), '2025-10-12');
	assert.equal(periodStart('all', '2026-10-11', '2025-03-04'), '2025-03-04');
	assert.equal(periodStart('all', '2026-10-11', null), '2026-10-11', 'ohne Einträge nur heute');
});

test('Anzahl, Schreibquote und Serien', () => {
	const days = ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-09', '2026-10-10'].map((d) => day(d));
	const s = computeStats(days, '2026-09-29', '2026-10-11');
	assert.equal(s.days, 13);
	assert.equal(s.written, 6, 'Tag vor dem Zeitraum zählt nicht');
	assert.deepEqual(s.longest, { length: 4, from: '2026-09-30', to: '2026-10-03' });
	assert.equal(s.currentStreak, 2, 'heute noch offen: Serie bis gestern');
});

test('Aktuelle Serie zählt über den Zeitraum hinaus, längste nur innerhalb', () => {
	const days = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map((d) => day(d));
	const s = computeStats(days, '2026-09-11', '2026-09-12');
	assert.equal(s.currentStreak, 5);
	assert.equal(s.longest?.length, 2);
	assert.equal(computeStats([], '2026-09-11', '2026-09-12').longest, null);
});

test('Stimmung: Durchschnitt nur über Tage mit Stimmung, pro Monat und pro Wochentag (Montag zuerst)', () => {
	const days = [
		day('2026-09-28', 2), // Montag
		day('2026-10-05', 4), // Montag
		day('2026-10-06', null), // Dienstag ohne Stimmung
		day('2026-10-11', 5) // Sonntag
	];
	const s = computeStats(days, '2026-09-01', '2026-10-11');
	assert.deepEqual(s.mood, { avg: 11 / 3, count: 3 });
	assert.deepEqual(
		s.byMonth.map((m) => [m.month, m.written, m.mood.avg]),
		[
			['2026-09', 1, 2],
			['2026-10', 3, 4.5]
		]
	);
	assert.deepEqual(s.byWeekday[0], { weekday: 1, avg: 3, count: 2 });
	assert.deepEqual(s.byWeekday[1], { weekday: 2, avg: null, count: 0 });
	assert.deepEqual(s.byWeekday[6], { weekday: 0, avg: 5, count: 1 });
});

test('Monate lückenlos, auch über den Jahreswechsel', () => {
	const s = computeStats([day('2026-02-03', 3)], '2025-11-20', '2026-02-10');
	assert.deepEqual(
		s.byMonth.map((m) => m.month),
		['2025-11', '2025-12', '2026-01', '2026-02']
	);
	assert.equal(s.byMonth[1].mood.avg, null);
	assert.equal(s.monthlyReviews.total, 4);
});

test('Ungültige Werte zählen nicht', () => {
	const s = computeStats(
		[
			day('2026-10-01', 7),
			day('2026-10-02', 0),
			day('2026-10-03', 2.5),
			{ date: '2026-10-04', kinds: ['gefuehl'], content: { mood: 3, energy: 9, emotions: ['joy', 'joy', 'unknown'] } }
		],
		'2026-10-01',
		'2026-10-04'
	);
	assert.deepEqual(s.mood, { avg: 3, count: 1 });
	assert.deepEqual(s.energy, { avg: null, count: 0 });
	assert.deepEqual(s.emotions, [{ id: 'joy', count: 1, pleasant: true }], 'doppelt und unbekannt zählen nicht');
});

test('Gefühle: Häufigkeit absteigend, bei Gleichstand in der Reihenfolge der Auswahl; angenehm/belastend', () => {
	const review = (date: string, emotions: string[], energy: number) =>
		({ date, kinds: ['gefuehl'], content: { mood: null, energy, emotions } }) satisfies StatsDay;
	const s = computeStats(
		[review('2026-10-04', ['stressed', 'joy'], 2), review('2026-10-11', ['tired', 'stressed', 'calm'], 4)],
		'2026-10-01',
		'2026-10-11'
	);
	assert.deepEqual(
		s.emotions.map((e) => [e.id, e.count, e.pleasant]),
		[
			['stressed', 2, false],
			['joy', 1, true],
			['calm', 1, true],
			['tired', 1, false]
		]
	);
	assert.deepEqual(s.energy, { avg: 3, count: 2 });
	assert.deepEqual(s.byMonth[0].energy, { avg: 3, count: 2 });
	assert.ok(PLEASANT_EMOTIONS.length > 0 && PLEASANT_EMOTIONS.length < EMOTIONS.length);
});

test('Rückblicke: Wochen ab Montag, die den Zeitraum berühren, und Monate', () => {
	// 1.10.2026 ist ein Donnerstag → Wochen ab 28.9., 5.10. und 12.10. (bis 14.10.)
	const days = [
		day('2026-09-30', null, { kinds: ['gefuehl'] }), // vor dem Zeitraum
		day('2026-10-04', null, { kinds: ['erlebt', 'gefuehl'] }),
		day('2026-10-03', null, { kinds: ['gefuehl'] }), // gleiche Woche
		day('2026-10-13', null, { kinds: ['wachstum'] })
	];
	const s = computeStats(days, '2026-10-01', '2026-10-14');
	assert.deepEqual(s.weeklyReviews, { done: 1, total: 3 });
	assert.deepEqual(s.monthlyReviews, { done: 1, total: 1 });
});

test('Gesperrte Einträge ohne PIN: zählen für Anzahl, Serien und Rückblicke, nicht für Stimmung', () => {
	const days = [day('2026-10-09', 4), locked('2026-10-10', ['gefuehl']), day('2026-10-11', 2)];
	const s = computeStats(days, '2026-10-01', '2026-10-11');
	assert.equal(s.written, 3);
	assert.equal(s.currentStreak, 3);
	assert.equal(s.hidden, 1);
	assert.deepEqual(s.mood, { avg: 3, count: 2 });
	assert.equal(s.weeklyReviews.done, 1);
	assert.equal(computeStats([locked('2026-09-01')], '2026-10-01', '2026-10-11').hidden, 0, 'nur im Zeitraum');
});
