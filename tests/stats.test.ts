import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, currentStreak, periodStart, PLEASANT_EMOTIONS, writingSummary, type StatsDay } from '../src/lib/stats.ts';
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
});

test('Längste Serie nur innerhalb des Zeitraums', () => {
	const days = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map((d) => day(d));
	const s = computeStats(days, '2026-09-11', '2026-09-12');
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
			['2026-10', 3, 4.5],
			['2026-09', 1, 2]
		],
		'neuester Monat zuerst'
	);
	assert.deepEqual(
		s.moodTrend,
		{
			weekly: false,
			points: [
				{ date: '2026-09-28', mood: 2 },
				{ date: '2026-10-05', mood: 4 },
				{ date: '2026-10-11', mood: 5 }
			]
		},
		'Verlauf pro Tag, ohne Tage ohne Stimmung'
	);
	assert.deepEqual(s.byWeekday[0], { weekday: 1, avg: 3, count: 2 });
	assert.deepEqual(s.byWeekday[1], { weekday: 2, avg: null, count: 0 });
	assert.deepEqual(s.byWeekday[6], { weekday: 0, avg: 5, count: 1 });
});

test('Stimmungsverlauf: über 90 Tage als Wochendurchschnitt, erste Woche ab Beginn des Zeitraums', () => {
	const days = [day('2026-07-01', 2), day('2026-07-04', 4), day('2026-07-06', 5), day('2026-07-07', null), day('2026-09-30', 1)];
	assert.equal(computeStats(days, '2026-07-04', '2026-10-01').moodTrend.weekly, false, '90 Tage: noch pro Tag');
	const s = computeStats(days, '2026-07-01', '2026-10-01'); // 93 Tage, 1.7. ist ein Mittwoch
	assert.deepEqual(s.moodTrend, {
		weekly: true,
		points: [
			{ date: '2026-07-01', mood: 3 },
			{ date: '2026-07-06', mood: 5 },
			{ date: '2026-09-28', mood: 1 }
		]
	});
});

test('Monate lückenlos, auch über den Jahreswechsel', () => {
	const s = computeStats([day('2026-02-03', 3)], '2025-11-20', '2026-02-10');
	assert.deepEqual(
		s.byMonth.map((m) => m.month),
		['2026-02', '2026-01', '2025-12', '2025-11']
	);
	assert.equal(s.byMonth[2].mood.avg, null);
	assert.equal(s.monthlyReviews.total, 3, '83 Tage ≈ 3 Monate');
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

test('Rückblicke: geschrieben pro Woche ab Montag bzw. pro Monat, möglich aus der Länge des Zeitraums', () => {
	// 1.–14.10.2026: 14 Tage = 2 mögliche Wochen, 1 Monat
	const days = [
		day('2026-09-30', null, { kinds: ['gefuehl'] }), // vor dem Zeitraum
		day('2026-10-04', null, { kinds: ['erlebt', 'gefuehl'] }),
		day('2026-10-03', null, { kinds: ['gefuehl'] }), // gleiche Woche
		day('2026-10-13', null, { kinds: ['wachstum'] })
	];
	const s = computeStats(days, '2026-10-01', '2026-10-14');
	assert.deepEqual(s.weeklyReviews, { done: 1, total: 2 });
	assert.deepEqual(s.monthlyReviews, { done: 1, total: 1 });
});

test('Rückblicke: mögliche Anzahl für alle Zeiträume, an jedem Wochentag gleich', () => {
	const expected = { '30': [4, 1], '90': [13, 3], '365': [52, 12] } as const;
	// eine ganze Woche lang jeden Tag als „heute“, auch über einen Monatsanfang und ein Schaltjahr
	for (const today of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2028-03-01']) {
		for (const [period, [weeks, months]] of Object.entries(expected)) {
			const s = computeStats([], periodStart(period as '30' | '90' | '365', today, null), today);
			assert.equal(s.weeklyReviews.total, weeks, `${period} Tage bis ${today}: Wochen`);
			assert.equal(s.monthlyReviews.total, months, `${period} Tage bis ${today}: Monate`);
		}
	}
	// „Alles“: ab dem ersten Eintrag, mindestens 1
	assert.deepEqual(computeStats([], '2026-10-15', '2026-10-17').weeklyReviews, { done: 0, total: 1 });
	assert.equal(computeStats([], '2024-10-18', '2026-10-17').weeklyReviews.total, 104);
	assert.equal(computeStats([], '2024-10-18', '2026-10-17').monthlyReviews.total, 24);
});

test('Rückblicke: angebrochene Wochen am Rand zählen als geschrieben, aber nie mehr als möglich', () => {
	// 12 Monate bis Samstag, 17.10.2026; jeden Sonntag ein Wochen-, jeden 1. ein Monatsrückblick
	const from = periodStart('365', '2026-10-17', null);
	const days: StatsDay[] = [];
	for (let d = '2025-10-01'; d <= '2026-10-17'; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) {
		const kinds: StatsDay['kinds'] = [];
		if (new Date(d).getUTCDay() === 0) kinds.push('gefuehl');
		if (d.endsWith('-01')) kinds.push('wachstum');
		if (kinds.length) days.push(day(d, null, { kinds }));
	}
	const s = computeStats(days, from, '2026-10-17');
	assert.deepEqual(s.weeklyReviews, { done: 52, total: 52 });
	assert.deepEqual(s.monthlyReviews, { done: 12, total: 12 });
	// zusätzlich am Mittwoch ein Rückblick in der laufenden Woche → 53 Wochen berührt, gezählt 52
	const more = computeStats([...days, day('2026-10-14', null, { kinds: ['gefuehl'] })], from, '2026-10-17');
	assert.deepEqual(more.weeklyReviews, { done: 52, total: 52 });
});

test('Gesperrte Einträge ohne PIN: zählen für Anzahl, Serien und Rückblicke, nicht für Stimmung', () => {
	const days = [day('2026-10-09', 4), locked('2026-10-10', ['gefuehl']), day('2026-10-11', 2)];
	const s = computeStats(days, '2026-10-01', '2026-10-11');
	assert.equal(s.written, 3);
	assert.equal(s.hidden, 1);
	assert.deepEqual(s.mood, { avg: 3, count: 2 });
	assert.equal(s.weeklyReviews.done, 1);
	assert.equal(computeStats([locked('2026-09-01')], '2026-10-01', '2026-10-11').hidden, 0, 'nur im Zeitraum');
});

test('Aktuelle Serie: mit heutigem Eintrag, sonst bis gestern, über Monats- und Jahresgrenzen', () => {
	assert.equal(currentStreak(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-06'], '2026-10-10'), 3);
	assert.equal(currentStreak(['2026-10-09', '2026-10-08'], '2026-10-10'), 2, 'heute noch offen');
	assert.equal(currentStreak(['2026-10-08', '2026-10-07'], '2026-10-10'), 0, 'gestern ausgelassen');
	assert.equal(currentStreak([], '2026-10-10'), 0);
	assert.equal(currentStreak(['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30'], '2026-01-02'), 4);
	assert.equal(currentStreak(['2026-03-01', '2026-02-28'], '2026-03-01'), 2);
});

test('Kennzahlen aus den Metadaten (Widget, Dashboard, Statistik)', () => {
	assert.deepEqual(writingSummary([], '2026-10-10'), { entries: 0, lastEntry: null, writtenToday: false, streak: 0 });
	const metas = [
		{ date: '2026-10-09', updatedAt: '2026-10-10T07:00:00.000Z' }, // gestern, heute nachgetragen
		{ date: '2026-10-10', updatedAt: '2026-10-10T06:00:00.000Z' },
		{ date: '2026-10-07', updatedAt: '2026-10-07T20:00:00.000Z' }
	];
	assert.deepEqual(writingSummary(metas, '2026-10-10'), {
		entries: 3,
		lastEntry: '2026-10-10T07:00:00.000Z',
		writtenToday: true,
		streak: 2
	});
	assert.equal(writingSummary(metas, '2026-10-11').writtenToday, false);
});
