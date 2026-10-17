import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, currentStreak, periodStart, PLEASANT_EMOTIONS, writingSummary, type StatsDay } from '../src/lib/stats.ts';
import { EMOTIONS } from '../src/lib/templates.ts';

const day = (date: string, mood: number | null = null, extra: Partial<StatsDay> = {}): StatsDay => ({
	date,
	kinds: ['daily'],
	content: { mood, energy: null, emotions: [] },
	...extra
});
const locked = (date: string, kinds: StatsDay['kinds'] = ['daily']): StatsDay => ({ date, kinds, content: null });

test('period: last 30/90/365 days including today, "all" from the first entry', () => {
	assert.equal(periodStart('30', '2026-10-11', '2025-01-01'), '2026-09-12');
	assert.equal(periodStart('90', '2026-10-11', null), '2026-07-14');
	assert.equal(periodStart('365', '2026-10-11', null), '2025-10-12');
	assert.equal(periodStart('all', '2026-10-11', '2025-03-04'), '2025-03-04');
	assert.equal(periodStart('all', '2026-10-11', null), '2026-10-11', 'without entries only today');
});

test('count, writing rate and streaks', () => {
	const days = ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-09', '2026-10-10'].map((d) => day(d));
	const s = computeStats(days, '2026-09-29', '2026-10-11');
	assert.equal(s.days, 13);
	assert.equal(s.written, 6, 'a day before the period does not count');
	assert.deepEqual(s.longest, { length: 4, from: '2026-09-30', to: '2026-10-03' });
});

test('longest streak only within the period', () => {
	const days = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map((d) => day(d));
	const s = computeStats(days, '2026-09-11', '2026-09-12');
	assert.equal(s.longest?.length, 2);
	assert.equal(computeStats([], '2026-09-11', '2026-09-12').longest, null);
});

test('mood: average only over days with a mood, per month and per weekday (Monday first)', () => {
	const days = [
		day('2026-09-28', 2), // Monday
		day('2026-10-05', 4), // Monday
		day('2026-10-06', null), // Tuesday without a mood
		day('2026-10-11', 5) // Sunday
	];
	const s = computeStats(days, '2026-09-01', '2026-10-11');
	assert.deepEqual(s.mood, { avg: 11 / 3, count: 3 });
	assert.deepEqual(
		s.byMonth.map((m) => [m.month, m.written, m.mood.avg]),
		[
			['2026-10', 3, 4.5],
			['2026-09', 1, 2]
		],
		'newest month first'
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
		'trend per day, without days without a mood'
	);
	assert.deepEqual(s.byWeekday[0], { weekday: 1, avg: 3, count: 2 });
	assert.deepEqual(s.byWeekday[1], { weekday: 2, avg: null, count: 0 });
	assert.deepEqual(s.byWeekday[6], { weekday: 0, avg: 5, count: 1 });
});

test('mood trend: above 90 days as weekly averages, first week from the start of the period', () => {
	const days = [day('2026-07-01', 2), day('2026-07-04', 4), day('2026-07-06', 5), day('2026-07-07', null), day('2026-09-30', 1)];
	assert.equal(computeStats(days, '2026-07-04', '2026-10-01').moodTrend.weekly, false, '90 days: still per day');
	const s = computeStats(days, '2026-07-01', '2026-10-01'); // 93 days, 1 July is a Wednesday
	assert.deepEqual(s.moodTrend, {
		weekly: true,
		points: [
			{ date: '2026-07-01', mood: 3 },
			{ date: '2026-07-06', mood: 5 },
			{ date: '2026-09-28', mood: 1 }
		]
	});
});

test('months without gaps, also across the turn of the year', () => {
	const s = computeStats([day('2026-02-03', 3)], '2025-11-20', '2026-02-10');
	assert.deepEqual(
		s.byMonth.map((m) => m.month),
		['2026-02', '2026-01', '2025-12', '2025-11']
	);
	assert.equal(s.byMonth[2].mood.avg, null);
	assert.equal(s.monthlyReviews.total, 3, '83 days ≈ 3 months');
});

test('invalid values do not count', () => {
	const s = computeStats(
		[
			day('2026-10-01', 7),
			day('2026-10-02', 0),
			day('2026-10-03', 2.5),
			{ date: '2026-10-04', kinds: ['feelings'], content: { mood: 3, energy: 9, emotions: ['joy', 'joy', 'unknown'] } }
		],
		'2026-10-01',
		'2026-10-04'
	);
	assert.deepEqual(s.mood, { avg: 3, count: 1 });
	assert.deepEqual(s.energy, { avg: null, count: 0 });
	assert.deepEqual(s.emotions, [{ id: 'joy', count: 1, pleasant: true }], 'duplicates and unknown ones do not count');
});

test('feelings: by frequency, on a tie in the order of the choice; pleasant/unpleasant', () => {
	const review = (date: string, emotions: string[], energy: number) =>
		({ date, kinds: ['feelings'], content: { mood: null, energy, emotions } }) satisfies StatsDay;
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

test('reviews: written per week from Monday or per month, possible from the length of the period', () => {
	// 1–14 Oct 2026: 14 days = 2 possible weeks, 1 month
	const days = [
		day('2026-09-30', null, { kinds: ['feelings'] }), // before the period
		day('2026-10-04', null, { kinds: ['daily', 'feelings'] }),
		day('2026-10-03', null, { kinds: ['feelings'] }), // same week
		day('2026-10-13', null, { kinds: ['growth'] })
	];
	const s = computeStats(days, '2026-10-01', '2026-10-14');
	assert.deepEqual(s.weeklyReviews, { done: 1, total: 2 });
	assert.deepEqual(s.monthlyReviews, { done: 1, total: 1 });
});

test('reviews: possible number for all periods, the same on every weekday', () => {
	const expected = { '30': [4, 1], '90': [13, 3], '365': [52, 12] } as const;
	// a whole week, each day as "today", also across the start of a month and a leap year
	for (const today of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2028-03-01']) {
		for (const [period, [weeks, months]] of Object.entries(expected)) {
			const s = computeStats([], periodStart(period as '30' | '90' | '365', today, null), today);
			assert.equal(s.weeklyReviews.total, weeks, `${period} days up to ${today}: weeks`);
			assert.equal(s.monthlyReviews.total, months, `${period} days up to ${today}: months`);
		}
	}
	// "all": from the first entry, at least 1
	assert.deepEqual(computeStats([], '2026-10-15', '2026-10-17').weeklyReviews, { done: 0, total: 1 });
	assert.equal(computeStats([], '2024-10-18', '2026-10-17').weeklyReviews.total, 104);
	assert.equal(computeStats([], '2024-10-18', '2026-10-17').monthlyReviews.total, 24);
});

test('reviews: partial weeks at the edge count as written, but never more than possible', () => {
	// 12 months up to Saturday, 17 Oct 2026; a weekly review every Sunday, a monthly review on every 1st
	const from = periodStart('365', '2026-10-17', null);
	const days: StatsDay[] = [];
	for (let d = '2025-10-01'; d <= '2026-10-17'; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) {
		const kinds: StatsDay['kinds'] = [];
		if (new Date(d).getUTCDay() === 0) kinds.push('feelings');
		if (d.endsWith('-01')) kinds.push('growth');
		if (kinds.length) days.push(day(d, null, { kinds }));
	}
	const s = computeStats(days, from, '2026-10-17');
	assert.deepEqual(s.weeklyReviews, { done: 52, total: 52 });
	assert.deepEqual(s.monthlyReviews, { done: 12, total: 12 });
	// additionally a review on Wednesday in the current week → 53 weeks touched, 52 counted
	const more = computeStats([...days, day('2026-10-14', null, { kinds: ['feelings'] })], from, '2026-10-17');
	assert.deepEqual(more.weeklyReviews, { done: 52, total: 52 });
});

test('locked entries without PIN: count for number, streaks and reviews, not for mood', () => {
	const days = [day('2026-10-09', 4), locked('2026-10-10', ['feelings']), day('2026-10-11', 2)];
	const s = computeStats(days, '2026-10-01', '2026-10-11');
	assert.equal(s.written, 3);
	assert.equal(s.hidden, 1);
	assert.deepEqual(s.mood, { avg: 3, count: 2 });
	assert.equal(s.weeklyReviews.done, 1);
	assert.equal(computeStats([locked('2026-09-01')], '2026-10-01', '2026-10-11').hidden, 0, 'only within the period');
});

test('current streak: with an entry today, otherwise up to yesterday, across month and year boundaries', () => {
	assert.equal(currentStreak(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-06'], '2026-10-10'), 3);
	assert.equal(currentStreak(['2026-10-09', '2026-10-08'], '2026-10-10'), 2, 'today still open');
	assert.equal(currentStreak(['2026-10-08', '2026-10-07'], '2026-10-10'), 0, 'yesterday skipped');
	assert.equal(currentStreak([], '2026-10-10'), 0);
	assert.equal(currentStreak(['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30'], '2026-01-02'), 4);
	assert.equal(currentStreak(['2026-03-01', '2026-02-28'], '2026-03-01'), 2);
});

test('figures from the metadata (widget, dashboard, statistics)', () => {
	assert.deepEqual(writingSummary([], '2026-10-10'), { entries: 0, lastEntry: null, writtenToday: false, streak: 0 });
	const metas = [
		{ date: '2026-10-09', updatedAt: '2026-10-10T07:00:00.000Z' }, // yesterday, filled in today
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
