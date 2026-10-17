import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	defaultReminders,
	isFeelingsDue,
	isGrowthDue,
	lastMonthlyDueOnOrBefore,
	lastWeekdayOnOrBefore,
	nextOccurrence,
	nextReview,
	occursOn,
	sanitizeCustomReminder,
	sanitizeReminders,
	suggestionsFor
} from '../src/lib/reminders.ts';
import type { ReminderSchedule } from '../src/lib/reminders.ts';
import type { EntryMeta, SectionKind } from '../src/lib/types.ts';

const meta = (date: string, kinds: SectionKind[]): EntryMeta => ({
	id: date,
	date,
	kinds,
	locked: false,
	aiAllowed: true,
	revision: 1,
	createdAt: date,
	updatedAt: date
});

const cfg = defaultReminders(); // feelings on Sundays, growth on the last day of the month

test('last weekday on or before a date', () => {
	assert.equal(lastWeekdayOnOrBefore('2026-10-11', 0), '2026-10-11'); // Sunday itself
	assert.equal(lastWeekdayOnOrBefore('2026-10-08', 0), '2026-10-04'); // Thursday → previous Sunday
	assert.equal(lastWeekdayOnOrBefore('2026-10-08', 4), '2026-10-08');
});

test('monthly due date: last day of the month and a fixed day', () => {
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-31', 'last'), '2026-10-31');
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-08', 'last'), '2026-09-30');
	assert.equal(lastMonthlyDueOnOrBefore('2026-03-05', 'last'), '2026-02-28');
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-08', 15), '2026-09-15');
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-20', 15), '2026-10-15');
});

const start = meta('2026-09-01', ['daily']); // the journal has been running for a while

test('feelings: due on Sunday if there was no review for about a week', () => {
	assert.equal(isFeelingsDue('2026-10-11', [start], cfg), true);
	assert.equal(isFeelingsDue('2026-10-11', [meta('2026-10-04', ['feelings']), start], cfg), true);
	assert.equal(isFeelingsDue('2026-10-11', [meta('2026-10-05', ['feelings']), start], cfg), true); // written one day too late
});

test('feelings: not due if the last review was less than a week ago', () => {
	assert.equal(isFeelingsDue('2026-10-11', [meta('2026-10-09', ['daily', 'feelings']), start], cfg), false);
	assert.equal(isFeelingsDue('2026-10-11', [meta('2026-10-06', ['feelings']), start], cfg), false);
	// … but on the following Sunday
	assert.equal(isFeelingsDue('2026-10-18', [meta('2026-10-06', ['feelings']), start], cfg), true);
});

test('new journal: weekly review only after the first week', () => {
	assert.equal(isFeelingsDue('2026-10-11', [], cfg), false);
	assert.equal(isFeelingsDue('2026-10-11', [meta('2026-10-08', ['daily'])], cfg), false);
	assert.equal(isFeelingsDue('2026-10-18', [meta('2026-10-08', ['daily'])], cfg), true);
});

test('feelings: stays due after Sunday until it is written', () => {
	assert.equal(isFeelingsDue('2026-10-13', [meta('2026-10-04', ['feelings']), start], cfg), true);
	assert.equal(isFeelingsDue('2026-10-13', [meta('2026-10-12', ['feelings']), start], cfg), false);
});

test('growth: due on the last day of the month if there was no review for about a month', () => {
	assert.equal(isGrowthDue('2026-10-31', [start], cfg), true);
	assert.equal(isGrowthDue('2026-10-31', [meta('2026-09-30', ['growth']), start], cfg), true);
	assert.equal(isGrowthDue('2026-10-31', [meta('2026-10-28', ['growth']), start], cfg), false);
	assert.equal(isGrowthDue('2026-10-31', [meta('2026-10-10', ['growth']), start], cfg), false);
	assert.equal(isGrowthDue('2026-11-30', [meta('2026-10-10', ['growth']), start], cfg), true);
});

test('new journal: monthly review only after about a month', () => {
	assert.equal(isGrowthDue('2026-10-31', [meta('2026-10-20', ['daily'])], cfg), false);
	assert.equal(isGrowthDue('2026-11-30', [meta('2026-10-20', ['daily'])], cfg), true);
});

test('the next review respects the minimum gap', () => {
	// new journal on Saturday, 10 October: first reminder only on the following Sunday or at the end of November
	const fresh = [meta('2026-10-10', ['daily'])];
	assert.equal(nextReview('feelings', fresh, cfg, '2026-10-10', 600), '2026-10-18');
	assert.equal(nextReview('growth', fresh, cfg, '2026-10-10', 600), '2026-11-30');
	// without any entries today counts as the start
	assert.equal(nextReview('feelings', [], cfg, '2026-10-10', 600), '2026-10-18');
	// running journal: the next Sunday, today only before the time
	assert.equal(nextReview('feelings', [start], cfg, '2026-10-10', 600), '2026-10-11');
	assert.equal(nextReview('feelings', [start], cfg, '2026-10-11', 18 * 60), '2026-10-11');
	assert.equal(nextReview('feelings', [start], cfg, '2026-10-11', 20 * 60), '2026-10-18');
	const off = sanitizeReminders({ feelings: { enabled: false }, growth: { enabled: false } }, 'de');
	assert.equal(nextReview('feelings', [start], off, '2026-10-10', 600), null);
});

test('switched-off reminders are never due', () => {
	const off = sanitizeReminders({ feelings: { enabled: false }, growth: { enabled: false } }, 'de');
	assert.equal(isFeelingsDue('2026-10-11', [], off), false);
	assert.equal(isGrowthDue('2026-10-31', [], off), false);
});

test('invalid input is set to default values', () => {
	const c = sanitizeReminders({ feelings: { enabled: true, weekday: 9, time: '25:99' }, growth: { enabled: true, day: 31 } }, 'en');
	assert.equal(c.feelings.weekday, 0);
	assert.equal(c.feelings.time, '19:00');
	assert.equal(c.growth.day, 'last');
	assert.equal(c.lang, 'en');
});

test('a review written today ends the hint', () => {
	const before = suggestionsFor('2026-10-11', [meta('2026-10-01', ['feelings'])], cfg);
	assert.equal(before.feelings.suggested, true);
	assert.equal(before.feelings.daysSince, 10);
	const after = suggestionsFor('2026-10-11', [meta('2026-10-11', ['feelings']), meta('2026-10-01', ['feelings'])], cfg);
	assert.equal(after.feelings.suggested, false);
});

const schedule = (s: Partial<ReminderSchedule>): ReminderSchedule => ({ repeat: 'daily', date: '', weekdays: [], day: 1, time: '08:00', ...s });

test('custom reminder: on which days it is due', () => {
	assert.equal(occursOn(schedule({ repeat: 'once', date: '2026-10-12' }), '2026-10-12'), true);
	assert.equal(occursOn(schedule({ repeat: 'once', date: '2026-10-12' }), '2026-10-13'), false);
	assert.equal(occursOn(schedule({ repeat: 'daily' }), '2026-10-13'), true);
	assert.equal(occursOn(schedule({ repeat: 'weekly', weekdays: [1, 3] }), '2026-10-12'), true); // Monday
	assert.equal(occursOn(schedule({ repeat: 'weekly', weekdays: [1, 3] }), '2026-10-13'), false); // Tuesday
	assert.equal(occursOn(schedule({ repeat: 'monthly', day: 'last' }), '2026-02-28'), true);
	assert.equal(occursOn(schedule({ repeat: 'monthly', day: 15 }), '2026-10-15'), true);
});

test('custom reminder: next due date', () => {
	const at9 = 9 * 60;
	assert.equal(nextOccurrence(schedule({ time: '10:00' }), '2026-10-09', at9), '2026-10-09');
	assert.equal(nextOccurrence(schedule({ time: '08:00' }), '2026-10-09', at9), '2026-10-10');
	assert.equal(nextOccurrence(schedule({ repeat: 'weekly', weekdays: [1] }), '2026-10-09', at9), '2026-10-12');
	assert.equal(nextOccurrence(schedule({ repeat: 'monthly', day: 5 }), '2026-10-09', at9), '2026-11-05');
	assert.equal(nextOccurrence(schedule({ repeat: 'once', date: '2026-10-01' }), '2026-10-09', at9), null);
});

test('custom reminder: input is checked', () => {
	assert.equal(sanitizeCustomReminder({ title: ' ', time: '08:00' }), 'reminders.errorTitle');
	assert.equal(sanitizeCustomReminder({ title: 'X', time: '8 Uhr' }), 'reminders.errorTime');
	assert.equal(sanitizeCustomReminder({ title: 'X', time: '08:00', repeat: 'once', date: '2026-02-30' }), 'reminders.errorDate');
	assert.equal(sanitizeCustomReminder({ title: 'X', time: '08:00', repeat: 'weekly', weekdays: [] }), 'reminders.errorWeekdays');
	const r = sanitizeCustomReminder({ title: ' Wasser ', time: '08:00', repeat: 'weekly', weekdays: [3, 1, 1, 9] });
	assert.ok(typeof r !== 'string');
	assert.equal(r.title, 'Wasser');
	assert.deepEqual(r.weekdays, [1, 3]);
	assert.equal(r.enabled, true);
});

test('old schedules without custom reminders stay valid', () => {
	const c = sanitizeReminders({ feelings: { enabled: true, weekday: 2, time: '20:00' } }, 'de');
	assert.deepEqual(c.custom, []);
	assert.equal(c.feelings.weekday, 2);
});
