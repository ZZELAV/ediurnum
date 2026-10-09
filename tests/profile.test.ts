import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { de } from '../src/lib/i18n/de.ts';
import { addYears } from '../src/lib/dates.ts';
import { changelogSection } from '../src/lib/changelog.ts';
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

test('Gleicher Tag in einem anderen Jahr', () => {
	assert.equal(addYears('2026-10-09', -1), '2025-10-09');
	assert.equal(addYears('2028-02-29', -1), '2027-02-28');
	assert.equal(addYears('2027-02-28', -3), '2024-02-28');
});

test('Changelog: Abschnitt der aktuellen Version', () => {
	const md = readFileSync('CHANGELOG.md', 'utf8');
	const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
	const section = changelogSection(md, version);
	assert.ok(section);
	assert.equal(section.version, version);
	assert.doesNotMatch(section.body, /^\[[^\]]+\]: http/m);
	assert.doesNotMatch(md, /\[Unreleased\]/);
});
