import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOTIONS, emptyContent, filledKinds, isEmptyContent, sanitizeContent, SECTIONS, sectionDef, upgradeContent, upgradeKind, upgradeSections } from '../src/lib/templates.ts';

test('field IDs stay stable (old answers depend on them – never rename, only add)', () => {
	const ids = Object.fromEntries(SECTIONS.map((s) => [s.kind, s.fields.map((f) => f.id)]));
	const required = {
		daily: ['gratitude', 'experienced', 'highlight', 'takeaway'],
		feelings: ['energy', 'emotions', 'energizers', 'drainers', 'onMyMind'],
		growth: ['learned', 'proud', 'growth', 'nextFocus']
	};
	for (const [kind, fields] of Object.entries(required)) {
		for (const f of fields) assert.ok(ids[kind]?.includes(f), `${kind}.${f} fehlt`);
	}
	for (const e of ['joy', 'gratitude', 'calm', 'tired', 'stressed', 'anxious', 'sad', 'overwhelmed']) {
		assert.ok(EMOTIONS.includes(e), `feeling ${e} missing`);
	}
});

test('sections: order and rhythm', () => {
	assert.deepEqual(
		SECTIONS.map((s) => [s.kind, s.rhythm]),
		[
			['daily', 'daily'],
			['feelings', 'weekly'],
			['growth', 'monthly']
		]
	);
	assert.equal(sectionDef('feelings').kind, 'feelings');
});

test('empty content', () => {
	const c = emptyContent();
	assert.deepEqual(c, { mood: null, sections: { daily: {} }, free: '' });
	assert.ok(isEmptyContent(c));
	assert.ok(isEmptyContent({ ...c, free: '  \n ' }), 'only whitespace counts as empty');
	assert.ok(isEmptyContent({ ...c, sections: { daily: { gratitude: ['', ' ', ''] } } }));
	assert.ok(!isEmptyContent({ ...c, mood: 3 }), 'a mood alone is an entry');
	assert.ok(!isEmptyContent({ ...c, free: 'x' }));
	assert.ok(!isEmptyContent({ ...c, sections: { feelings: { energy: 2 } } }));
});

test('filled sections', () => {
	assert.deepEqual(filledKinds({ mood: null, free: '', sections: { daily: { gratitude: ['', 'x', ''] } } }), ['daily']);
	assert.deepEqual(filledKinds({ mood: null, free: '', sections: { feelings: { emotions: [] }, growth: { learned: ' ' } } }), []);
	assert.deepEqual(filledKinds({ mood: null, free: '', sections: { growth: { proud: 'a' }, daily: { highlight: 'b' } } }), ['daily', 'growth']);
});

test('sanitizing: only known fields and valid values', () => {
	const c = sanitizeContent({
		mood: 9,
		free: 'frei',
		evil: 'x',
		sections: {
			daily: { highlight: 'Sonnenaufgang', hacker: 'x', gratitude: ['a', 2, 'c', 'd'] },
			feelings: { energy: 4, emotions: ['joy', 'unbekannt', 3] },
			unbekannt: { a: 1 }
		}
	});
	assert.equal(c.mood, null);
	assert.equal(c.free, 'frei');
	assert.ok(!('evil' in c));
	assert.ok(!('unbekannt' in c.sections));
	assert.ok(!('hacker' in c.sections.daily!));
	assert.deepEqual(c.sections.daily!.gratitude, ['a', '', 'c']);
	assert.equal(c.sections.daily!.experienced, '', 'missing fields are added empty');
	assert.deepEqual(c.sections.feelings!.emotions, ['joy']);
	assert.equal(c.sections.feelings!.energy, 4);
	assert.ok(!('growth' in c.sections), 'sections that were not opened stay away');
});

test('sanitizing: mood and scales only whole numbers from 1 to 5', () => {
	const mood = (v: unknown) => sanitizeContent({ mood: v }).mood;
	assert.equal(mood(1), 1);
	assert.equal(mood(5), 5);
	assert.equal(mood('3'), 3);
	for (const v of [0, 6, 2.5, -1, 'x', '', null, undefined]) assert.equal(mood(v), null, String(v));
	assert.equal(sanitizeContent({ sections: { feelings: { energy: 0 } } }).sections.feelings!.energy, null);
});

test('sanitizing: daily is always there, wrong types become empty', () => {
	assert.deepEqual(sanitizeContent(null), { mood: null, sections: { daily: {} }, free: '' });
	assert.deepEqual(sanitizeContent('Unsinn'), { mood: null, sections: { daily: {} }, free: '' });
	const c = sanitizeContent({ sections: { daily: 'kein Objekt', feelings: { emotions: 'joy' } }, free: 42 });
	assert.deepEqual(c.sections.daily, {});
	assert.deepEqual(c.sections.feelings!.emotions, []);
	assert.equal(c.free, '');
});

test('sanitizing: lengths are limited', () => {
	const c = sanitizeContent({
		free: 'x'.repeat(200_000),
		sections: { daily: { experienced: 'y'.repeat(60_000), gratitude: ['z'.repeat(2000)] } }
	});
	assert.equal(c.free.length, 100_000);
	assert.equal((c.sections.daily!.experienced as string).length, 50_000);
	assert.equal((c.sections.daily!.gratitude as string[])[0].length, 1000);
});

test('legacy section kinds (up to 1.0.0) get their current names', () => {
	assert.equal(upgradeKind('erlebt'), 'daily');
	assert.equal(upgradeKind('gefuehl'), 'feelings');
	assert.equal(upgradeKind('wachstum'), 'growth');
	assert.equal(upgradeKind('daily'), 'daily');
	assert.equal(upgradeKind('toString'), 'toString', 'no lookup on the prototype');
	assert.equal(upgradeKind(''), '');
});

test('legacy sections: renamed in place, current names win, unchanged objects stay the same', () => {
	const sections = { gefuehl: { energy: 2 }, erlebt: { highlight: 'a' }, wachstum: { learned: 'b' } };
	const upgraded = upgradeSections(sections);
	assert.deepEqual(Object.keys(upgraded), ['feelings', 'daily', 'growth'], 'order kept');
	assert.deepEqual(upgraded, { feelings: { energy: 2 }, daily: { highlight: 'a' }, growth: { learned: 'b' } });
	assert.deepEqual(upgradeSections({ erlebt: { highlight: 'alt' }, daily: { highlight: 'neu' } }), { daily: { highlight: 'neu' } });
	const current = { daily: {}, feelings: {} };
	assert.equal(upgradeSections(current), current);
	assert.deepEqual(upgradeSections({ __proto__: { erlebt: 1 } } as Record<string, unknown>), {});
});

test('legacy content: converted when read, missing sections tolerated', () => {
	const legacy = { mood: 3, sections: { erlebt: { highlight: 'x' } }, free: 'f' } as unknown as Parameters<typeof upgradeContent>[0];
	assert.deepEqual(upgradeContent(legacy), { mood: 3, sections: { daily: { highlight: 'x' } }, free: 'f' });
	assert.equal(legacy.sections.daily, undefined, 'input not changed');
	const current = emptyContent();
	assert.equal(upgradeContent(current), current);
	const broken = { mood: null, free: '' } as unknown as Parameters<typeof upgradeContent>[0];
	assert.equal(upgradeContent(broken), broken);
});

test('sanitizing accepts legacy names from a page loaded before the update', () => {
	const c = sanitizeContent({ mood: 4, sections: { erlebt: { highlight: 'alt' }, gefuehl: { energy: 5, emotions: ['joy', 'nope'] } }, free: '' });
	assert.equal(c.sections.daily?.highlight, 'alt');
	assert.equal(c.sections.feelings?.energy, 5);
	assert.deepEqual(c.sections.feelings?.emotions, ['joy']);
	assert.deepEqual(Object.keys(c.sections), ['daily', 'feelings']);
});
