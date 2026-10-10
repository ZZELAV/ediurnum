import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOTIONS, emptyContent, filledKinds, isEmptyContent, sanitizeContent, SECTIONS, sectionDef } from '../src/lib/templates.ts';

test('Feld-IDs bleiben stabil (alte Antworten hängen daran – nie umbenennen, nur ergänzen)', () => {
	const ids = Object.fromEntries(SECTIONS.map((s) => [s.kind, s.fields.map((f) => f.id)]));
	const required = {
		erlebt: ['gratitude', 'experienced', 'highlight', 'takeaway'],
		gefuehl: ['energy', 'emotions', 'energizers', 'drainers', 'onMyMind'],
		wachstum: ['learned', 'proud', 'growth', 'nextFocus']
	};
	for (const [kind, fields] of Object.entries(required)) {
		for (const f of fields) assert.ok(ids[kind]?.includes(f), `${kind}.${f} fehlt`);
	}
	for (const e of ['joy', 'gratitude', 'calm', 'tired', 'stressed', 'anxious', 'sad', 'overwhelmed']) {
		assert.ok(EMOTIONS.includes(e), `Gefühl ${e} fehlt`);
	}
});

test('Abschnitte: Reihenfolge und Rhythmus', () => {
	assert.deepEqual(
		SECTIONS.map((s) => [s.kind, s.rhythm]),
		[
			['erlebt', 'daily'],
			['gefuehl', 'weekly'],
			['wachstum', 'monthly']
		]
	);
	assert.equal(sectionDef('gefuehl').kind, 'gefuehl');
});

test('Leerer Inhalt', () => {
	const c = emptyContent();
	assert.deepEqual(c, { mood: null, sections: { erlebt: {} }, free: '' });
	assert.ok(isEmptyContent(c));
	assert.ok(isEmptyContent({ ...c, free: '  \n ' }), 'nur Leerraum zählt als leer');
	assert.ok(isEmptyContent({ ...c, sections: { erlebt: { gratitude: ['', ' ', ''] } } }));
	assert.ok(!isEmptyContent({ ...c, mood: 3 }), 'eine Stimmung allein ist ein Eintrag');
	assert.ok(!isEmptyContent({ ...c, free: 'x' }));
	assert.ok(!isEmptyContent({ ...c, sections: { gefuehl: { energy: 2 } } }));
});

test('Gefüllte Abschnitte', () => {
	assert.deepEqual(filledKinds({ mood: null, free: '', sections: { erlebt: { gratitude: ['', 'x', ''] } } }), ['erlebt']);
	assert.deepEqual(filledKinds({ mood: null, free: '', sections: { gefuehl: { emotions: [] }, wachstum: { learned: ' ' } } }), []);
	assert.deepEqual(filledKinds({ mood: null, free: '', sections: { wachstum: { proud: 'a' }, erlebt: { highlight: 'b' } } }), ['erlebt', 'wachstum']);
});

test('Bereinigung: nur bekannte Felder und gültige Werte', () => {
	const c = sanitizeContent({
		mood: 9,
		free: 'frei',
		evil: 'x',
		sections: {
			erlebt: { highlight: 'Sonnenaufgang', hacker: 'x', gratitude: ['a', 2, 'c', 'd'] },
			gefuehl: { energy: 4, emotions: ['joy', 'unbekannt', 3] },
			unbekannt: { a: 1 }
		}
	});
	assert.equal(c.mood, null);
	assert.equal(c.free, 'frei');
	assert.ok(!('evil' in c));
	assert.ok(!('unbekannt' in c.sections));
	assert.ok(!('hacker' in c.sections.erlebt!));
	assert.deepEqual(c.sections.erlebt!.gratitude, ['a', '', 'c']);
	assert.equal(c.sections.erlebt!.experienced, '', 'fehlende Felder werden leer ergänzt');
	assert.deepEqual(c.sections.gefuehl!.emotions, ['joy']);
	assert.equal(c.sections.gefuehl!.energy, 4);
	assert.ok(!('wachstum' in c.sections), 'nicht geöffnete Abschnitte bleiben weg');
});

test('Bereinigung: Stimmung und Skalen nur ganze Zahlen von 1 bis 5', () => {
	const mood = (v: unknown) => sanitizeContent({ mood: v }).mood;
	assert.equal(mood(1), 1);
	assert.equal(mood(5), 5);
	assert.equal(mood('3'), 3);
	for (const v of [0, 6, 2.5, -1, 'x', '', null, undefined]) assert.equal(mood(v), null, String(v));
	assert.equal(sanitizeContent({ sections: { gefuehl: { energy: 0 } } }).sections.gefuehl!.energy, null);
});

test('Bereinigung: Erlebt ist immer vorhanden, falsche Typen werden zu leer', () => {
	assert.deepEqual(sanitizeContent(null), { mood: null, sections: { erlebt: {} }, free: '' });
	assert.deepEqual(sanitizeContent('Unsinn'), { mood: null, sections: { erlebt: {} }, free: '' });
	const c = sanitizeContent({ sections: { erlebt: 'kein Objekt', gefuehl: { emotions: 'joy' } }, free: 42 });
	assert.deepEqual(c.sections.erlebt, {});
	assert.deepEqual(c.sections.gefuehl!.emotions, []);
	assert.equal(c.free, '');
});

test('Bereinigung: Längen sind begrenzt', () => {
	const c = sanitizeContent({
		free: 'x'.repeat(200_000),
		sections: { erlebt: { experienced: 'y'.repeat(60_000), gratitude: ['z'.repeat(2000)] } }
	});
	assert.equal(c.free.length, 100_000);
	assert.equal((c.sections.erlebt!.experienced as string).length, 50_000);
	assert.equal((c.sections.erlebt!.gratitude as string[])[0].length, 1000);
});
