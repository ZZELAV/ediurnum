import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { de } from '../src/lib/i18n/de.ts';
import { deCH } from '../src/lib/i18n/de-CH.ts';
import { en } from '../src/lib/i18n/en.ts';
import { enGB } from '../src/lib/i18n/en-GB.ts';
import { SECTIONS } from '../src/lib/templates.ts';
import { isLang, locale, pickLang, translate } from '../src/lib/i18n/index.ts';
import { it } from '../src/lib/i18n/it.ts';

test('all languages have the same keys', () => {
	for (const [name, dict] of Object.entries({ de, it })) {
		const missing = Object.keys(en).filter((k) => !(k in dict));
		const extra = Object.keys(dict).filter((k) => !(k in en));
		assert.deepEqual(missing, [], `missing in ${name}.ts: ${missing.join(', ')}`);
		assert.deepEqual(extra, [], `missing in en.ts: ${extra.join(', ')}`);
	}
});

test('all text keys used in the code exist', () => {
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const f of readdirSync(dir)) {
			const p = join(dir, f);
			if (statSync(p).isDirectory()) walk(p);
			else if (/\.(svelte|ts)$/.test(f) && !p.includes('i18n')) files.push(p);
		}
	};
	walk('src');
	const missing = new Set<string>();
	for (const file of files) {
		const src = readFileSync(file, 'utf8');
		for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in en)) missing.add(`${m[1]} (${file})`);
		for (const m of src.matchAll(/error: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) if (!(m[1] in en)) missing.add(`${m[1]} (${file})`);
	}
	// check the dynamically composed keys of the templates
	for (const s of SECTIONS) {
		for (const k of [`section.${s.kind}.title`, `section.${s.kind}.intro`, `entry.rhythm.${s.rhythm}`]) if (!(k in en)) missing.add(k);
		for (const f of s.fields) {
			if (!(`section.${s.kind}.${f.id}` in en)) missing.add(`section.${s.kind}.${f.id}`);
			if ((f.type === 'text' || f.type === 'textarea' || f.type === 'lines') && !(`section.${s.kind}.${f.id}.hint` in en))
				missing.add(`section.${s.kind}.${f.id}.hint`);
			for (const o of f.options ?? []) if (!(`emotion.${o}` in en)) missing.add(`emotion.${o}`);
		}
	}
	assert.deepEqual([...missing], []);
});

test('placeholders such as {count} are the same in all languages', () => {
	const vars = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(',');
	for (const [name, dict] of Object.entries({ de, it })) {
		const differ = Object.keys(dict).filter((k) => k in en && vars(dict[k]) !== vars(en[k]));
		assert.deepEqual(differ, [], `placeholders differ in ${name}.ts`);
	}
});

test('singular forms (.one) have a base form, no text is empty', () => {
	const all = { ...de, ...en, ...it };
	const orphans = Object.keys(all).filter((k) => k.endsWith('.one') && !(k.slice(0, -4) in en));
	assert.deepEqual(orphans, []);
	const empty = [de, en, it].flatMap((dict) => Object.entries(dict)).filter(([, v]) => !v.trim()).map(([k]) => k);
	assert.deepEqual(empty, []);
});

test('Swiss spelling: every German text with "ß" has a variant with "ss" in de-CH.ts', () => {
	assert.deepEqual(Object.keys(de).filter((k) => de[k].includes('ß') && !(k in deCH)), []);
	assert.deepEqual(Object.keys(deCH).filter((k) => deCH[k].includes('ß')), [], 'no "ß" in de-CH.ts');
	assert.equal(translate('de-CH', 'setup.intro'), deCH['setup.intro']);
	assert.equal(translate('de-LI', 'setup.intro'), deCH['setup.intro']);
	assert.match(translate('de-DE', 'setup.intro'), /heißt/);
	assert.match(translate('de-AT', 'setup.intro'), /heißt/);
});

test('spelling variants only change existing texts and keep the placeholders', () => {
	const vars = (s: string) => [...new Set(s.match(/{w+}/g) ?? [])].sort().join(',');
	for (const [variant, base] of [[deCH, de], [enGB, en]]) {
		assert.deepEqual(Object.keys(variant).filter((k) => !(k in base)), [], 'unknown keys');
		assert.deepEqual(Object.keys(variant).filter((k) => vars(variant[k]) !== vars(base[k])), [], 'placeholders differ');
		assert.deepEqual(Object.keys(variant).filter((k) => variant[k] === base[k]), [], 'same text as the base');
	}
});

test('English: US spelling in the USA, its territories, the Philippines and Canada, British elsewhere', () => {
	assert.equal(translate('en', 'insights.run'), 'Analyze');
	assert.equal(translate('en-US', 'insights.run'), 'Analyze');
	assert.equal(translate('en-GB', 'insights.run'), 'Analyse');
	assert.equal(translate('en-CH', 'insights.run'), 'Analyse');
	assert.equal(translate('en-AU', 'insights.run'), 'Analyse');
	for (const tag of ['en-CA', 'en-PR', 'en-GU', 'en-PH']) assert.equal(translate(tag, 'insights.run'), 'Analyze', tag);
});

test('welcome card: all texts exist', () => {
	// welcome.ts depends on the database – so read the steps from the source code
	const src = readFileSync('src/lib/server/welcome.ts', 'utf8');
	const steps = [...(src.match(/WELCOME_STEPS = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
	assert.ok(steps.length >= 5);
	const keys = steps.flatMap((s) => [`welcome.${s}`, `welcome.${s}.hint`]);
	assert.deepEqual(keys.filter((k) => !(k in en)), []);
});

test('English is the default: for browsers in other languages and for missing texts', () => {
	assert.equal(pickLang('de-CH,de;q=0.9,en;q=0.8'), 'de');
	assert.equal(pickLang('de'), 'de');
	assert.equal(pickLang('en-US,en;q=0.9'), 'en');
	assert.equal(pickLang('fr-CH,de;q=0.8'), 'en', 'only the first language counts');
	assert.equal(pickLang(null), 'en');
	assert.equal(pickLang(''), 'en');
	assert.equal(translate('de', 'nav.stats'), de['nav.stats']);
	// a text that exists only in English
	en['test.onlyEnglish'] = 'Only in English';
	assert.equal(translate('de', 'test.onlyEnglish'), 'Only in English');
	delete en['test.onlyEnglish'];
});

test('Italian: chosen for Italian browsers, missing texts in English, own formats', () => {
	assert.equal(pickLang('it-CH,it;q=0.9,de;q=0.8'), 'it');
	assert.equal(pickLang('it'), 'it');
	assert.ok(isLang('it') && !isLang('fr') && !isLang('toString'));
	assert.equal(translate('it', 'nav.stats'), it['nav.stats'] ?? en['nav.stats']);
	assert.equal(locale('it'), 'it-IT');
});
