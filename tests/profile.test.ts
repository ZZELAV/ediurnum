import { test } from 'node:test';
import assert from 'node:assert/strict';
import { de } from '../src/lib/i18n/de.ts';
import { isEmptyProfile, JOURNALING, PROFILE_TEXTS, profileMarkdown, sanitizeProfile, TRAITS, VALUES } from '../src/lib/profile.ts';

test('Selbsteinschätzung: ungültige Werte werden verworfen', () => {
	const p = sanitizeProfile({
		journaling: 'sometimes',
		satisfaction: 9,
		traits: { openness: 4, extraversion: 0 },
		values: ['family', 'money', 'health'],
		texts: { goals: ' Mehr Sport ', life: '   ' }
	});
	assert.equal(p.journaling, '');
	assert.equal(p.satisfaction, null);
	assert.equal(p.traits.openness, 4);
	assert.equal(p.traits.extraversion, null);
	assert.deepEqual(p.values, ['family', 'health']);
	assert.deepEqual(p.texts, { goals: ' Mehr Sport ' });
	assert.equal(isEmptyProfile(p), false);
	assert.equal(isEmptyProfile(sanitizeProfile({})), true);
});

test('Selbsteinschätzung: Markdown für die KI', () => {
	const tr = (k: string) => de[k] ?? k;
	const md = profileMarkdown(sanitizeProfile({ journaling: 'none', traits: { stability: 2 }, values: ['calm'], texts: { goals: 'A\nB' } }), 'Anna', tr);
	assert.match(md, /- Name: Anna/);
	assert.match(md, /Noch nie/);
	assert.match(md, /Gemüt: 2\/5 \(1 = schnell besorgt, angespannt, 5 = meist gelassen\)/);
	assert.match(md, /Ruhe/);
	assert.match(md, /: A B$/m);
});

test('Selbsteinschätzung: alle Texte existieren', () => {
	const keys = [
		...JOURNALING.map((j) => `profile.journaling.${j}`),
		...TRAITS.flatMap((t) => [`profile.trait.${t}`, `profile.trait.${t}.low`, `profile.trait.${t}.high`]),
		...VALUES.map((v) => `profile.value.${v}`),
		...PROFILE_TEXTS.flatMap((k) => [`profile.${k}`, `profile.${k}.hint`])
	];
	assert.deepEqual(keys.filter((k) => !(k in de)), []);
});
