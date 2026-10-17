import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismiss, isDismissed } from '../src/lib/suggest.ts';

// like the browser's Storage: keys as own properties, methods on the prototype
const storage = Object.create({
	getItem(this: Record<string, string>, k: string) {
		return k in this ? this[k] : null;
	},
	setItem(this: Record<string, string>, k: string, v: string) {
		this[k] = String(v);
	},
	removeItem(this: Record<string, string>, k: string) {
		delete this[k];
	}
});
Object.assign(globalThis, { localStorage: storage });

test('"not today" applies to the day and section only', () => {
	dismiss('2026-10-17', 'feelings');
	assert.equal(isDismissed('2026-10-17', 'feelings'), true);
	assert.equal(isDismissed('2026-10-17', 'growth'), false);
	assert.equal(isDismissed('2026-10-18', 'feelings'), false);
});

test('dismissing removes the marks of other days, including old section names', () => {
	storage['ediurnum:suggest-later:2026-10-10:gefuehl'] = '1';
	storage['ediurnum:pending-answer'] = '{}';
	dismiss('2026-10-17', 'growth');
	assert.deepEqual(Object.keys(storage).sort(), [
		'ediurnum:pending-answer',
		'ediurnum:suggest-later:2026-10-17:feelings',
		'ediurnum:suggest-later:2026-10-17:growth'
	]);
	dismiss('2026-10-18', 'feelings');
	assert.deepEqual(Object.keys(storage).sort(), ['ediurnum:pending-answer', 'ediurnum:suggest-later:2026-10-18:feelings']);
});
