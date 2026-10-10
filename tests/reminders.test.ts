import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	defaultReminders,
	isGefuehlDue,
	isWachstumDue,
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

const cfg = defaultReminders(); // Gefühl sonntags, Weiterentwicklung am Monatsletzten

test('Letzter Wochentag am oder vor einem Datum', () => {
	assert.equal(lastWeekdayOnOrBefore('2026-10-11', 0), '2026-10-11'); // Sonntag selbst
	assert.equal(lastWeekdayOnOrBefore('2026-10-08', 0), '2026-10-04'); // Donnerstag → vorheriger Sonntag
	assert.equal(lastWeekdayOnOrBefore('2026-10-08', 4), '2026-10-08');
});

test('Monatliche Fälligkeit: Monatsletzter und fixer Tag', () => {
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-31', 'last'), '2026-10-31');
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-08', 'last'), '2026-09-30');
	assert.equal(lastMonthlyDueOnOrBefore('2026-03-05', 'last'), '2026-02-28');
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-08', 15), '2026-09-15');
	assert.equal(lastMonthlyDueOnOrBefore('2026-10-20', 15), '2026-10-15');
});

const start = meta('2026-09-01', ['erlebt']); // Tagebuch läuft schon länger

test('Gefühl: fällig am Sonntag, wenn seit rund einer Woche kein Rückblick', () => {
	assert.equal(isGefuehlDue('2026-10-11', [start], cfg), true);
	assert.equal(isGefuehlDue('2026-10-11', [meta('2026-10-04', ['gefuehl']), start], cfg), true);
	assert.equal(isGefuehlDue('2026-10-11', [meta('2026-10-05', ['gefuehl']), start], cfg), true); // einen Tag zu spät geschrieben
});

test('Gefühl: nicht fällig, wenn der letzte Rückblick weniger als eine Woche zurückliegt', () => {
	assert.equal(isGefuehlDue('2026-10-11', [meta('2026-10-09', ['erlebt', 'gefuehl']), start], cfg), false);
	assert.equal(isGefuehlDue('2026-10-11', [meta('2026-10-06', ['gefuehl']), start], cfg), false);
	// … dafür am Sonntag darauf
	assert.equal(isGefuehlDue('2026-10-18', [meta('2026-10-06', ['gefuehl']), start], cfg), true);
});

test('Neues Tagebuch: Wochenrückblick erst nach der ersten Woche', () => {
	assert.equal(isGefuehlDue('2026-10-11', [], cfg), false);
	assert.equal(isGefuehlDue('2026-10-11', [meta('2026-10-08', ['erlebt'])], cfg), false);
	assert.equal(isGefuehlDue('2026-10-18', [meta('2026-10-08', ['erlebt'])], cfg), true);
});

test('Gefühl: bleibt nach dem Sonntag fällig, bis es geschrieben ist', () => {
	assert.equal(isGefuehlDue('2026-10-13', [meta('2026-10-04', ['gefuehl']), start], cfg), true);
	assert.equal(isGefuehlDue('2026-10-13', [meta('2026-10-12', ['gefuehl']), start], cfg), false);
});

test('Weiterentwicklung: fällig am Monatsletzten, wenn seit rund einem Monat kein Rückblick', () => {
	assert.equal(isWachstumDue('2026-10-31', [start], cfg), true);
	assert.equal(isWachstumDue('2026-10-31', [meta('2026-09-30', ['wachstum']), start], cfg), true);
	assert.equal(isWachstumDue('2026-10-31', [meta('2026-10-28', ['wachstum']), start], cfg), false);
	assert.equal(isWachstumDue('2026-10-31', [meta('2026-10-10', ['wachstum']), start], cfg), false);
	assert.equal(isWachstumDue('2026-11-30', [meta('2026-10-10', ['wachstum']), start], cfg), true);
});

test('Neues Tagebuch: Monatsrückblick erst nach rund einem Monat', () => {
	assert.equal(isWachstumDue('2026-10-31', [meta('2026-10-20', ['erlebt'])], cfg), false);
	assert.equal(isWachstumDue('2026-11-30', [meta('2026-10-20', ['erlebt'])], cfg), true);
});

test('Nächster Rückblick berücksichtigt den Mindestabstand', () => {
	// Neues Tagebuch am Samstag, 10. Oktober: erste Erinnerung erst am Sonntag darauf bzw. Ende November
	const fresh = [meta('2026-10-10', ['erlebt'])];
	assert.equal(nextReview('gefuehl', fresh, cfg, '2026-10-10', 600), '2026-10-18');
	assert.equal(nextReview('wachstum', fresh, cfg, '2026-10-10', 600), '2026-11-30');
	// Ganz ohne Einträge zählt heute als Beginn
	assert.equal(nextReview('gefuehl', [], cfg, '2026-10-10', 600), '2026-10-18');
	// Laufendes Tagebuch: der nächste Sonntag, heute nur vor der Uhrzeit
	assert.equal(nextReview('gefuehl', [start], cfg, '2026-10-10', 600), '2026-10-11');
	assert.equal(nextReview('gefuehl', [start], cfg, '2026-10-11', 18 * 60), '2026-10-11');
	assert.equal(nextReview('gefuehl', [start], cfg, '2026-10-11', 20 * 60), '2026-10-18');
	const off = sanitizeReminders({ gefuehl: { enabled: false }, wachstum: { enabled: false } }, 'de');
	assert.equal(nextReview('gefuehl', [start], off, '2026-10-10', 600), null);
});

test('Ausgeschaltete Erinnerungen sind nie fällig', () => {
	const off = sanitizeReminders({ gefuehl: { enabled: false }, wachstum: { enabled: false } }, 'de');
	assert.equal(isGefuehlDue('2026-10-11', [], off), false);
	assert.equal(isWachstumDue('2026-10-31', [], off), false);
});

test('Ungültige Eingaben werden auf Standardwerte gesetzt', () => {
	const c = sanitizeReminders({ gefuehl: { enabled: true, weekday: 9, time: '25:99' }, wachstum: { enabled: true, day: 31 } }, 'en');
	assert.equal(c.gefuehl.weekday, 0);
	assert.equal(c.gefuehl.time, '19:00');
	assert.equal(c.wachstum.day, 'last');
	assert.equal(c.lang, 'en');
});

test('Heute geschriebener Rückblick beendet den Hinweis', () => {
	const before = suggestionsFor('2026-10-11', [meta('2026-10-01', ['gefuehl'])], cfg);
	assert.equal(before.gefuehl.suggested, true);
	assert.equal(before.gefuehl.daysSince, 10);
	const after = suggestionsFor('2026-10-11', [meta('2026-10-11', ['gefuehl']), meta('2026-10-01', ['gefuehl'])], cfg);
	assert.equal(after.gefuehl.suggested, false);
});

const schedule = (s: Partial<ReminderSchedule>): ReminderSchedule => ({ repeat: 'daily', date: '', weekdays: [], day: 1, time: '08:00', ...s });

test('Eigene Erinnerung: an welchen Tagen sie ansteht', () => {
	assert.equal(occursOn(schedule({ repeat: 'once', date: '2026-10-12' }), '2026-10-12'), true);
	assert.equal(occursOn(schedule({ repeat: 'once', date: '2026-10-12' }), '2026-10-13'), false);
	assert.equal(occursOn(schedule({ repeat: 'daily' }), '2026-10-13'), true);
	assert.equal(occursOn(schedule({ repeat: 'weekly', weekdays: [1, 3] }), '2026-10-12'), true); // Montag
	assert.equal(occursOn(schedule({ repeat: 'weekly', weekdays: [1, 3] }), '2026-10-13'), false); // Dienstag
	assert.equal(occursOn(schedule({ repeat: 'monthly', day: 'last' }), '2026-02-28'), true);
	assert.equal(occursOn(schedule({ repeat: 'monthly', day: 15 }), '2026-10-15'), true);
});

test('Eigene Erinnerung: nächste Fälligkeit', () => {
	const at9 = 9 * 60;
	assert.equal(nextOccurrence(schedule({ time: '10:00' }), '2026-10-09', at9), '2026-10-09');
	assert.equal(nextOccurrence(schedule({ time: '08:00' }), '2026-10-09', at9), '2026-10-10');
	assert.equal(nextOccurrence(schedule({ repeat: 'weekly', weekdays: [1] }), '2026-10-09', at9), '2026-10-12');
	assert.equal(nextOccurrence(schedule({ repeat: 'monthly', day: 5 }), '2026-10-09', at9), '2026-11-05');
	assert.equal(nextOccurrence(schedule({ repeat: 'once', date: '2026-10-01' }), '2026-10-09', at9), null);
});

test('Eigene Erinnerung: Eingaben werden geprüft', () => {
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

test('Alte Zeitpläne ohne eigene Erinnerungen bleiben gültig', () => {
	const c = sanitizeReminders({ gefuehl: { enabled: true, weekday: 2, time: '20:00' } }, 'de');
	assert.deepEqual(c.custom, []);
	assert.equal(c.gefuehl.weekday, 2);
});
