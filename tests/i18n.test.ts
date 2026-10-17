import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { de } from '../src/lib/i18n/de.ts';
import { en } from '../src/lib/i18n/en.ts';
import { SECTIONS } from '../src/lib/templates.ts';

test('both languages have the same keys', () => {
	const missingEn = Object.keys(de).filter((k) => !(k in en));
	const missingDe = Object.keys(en).filter((k) => !(k in de));
	assert.deepEqual(missingEn, [], `missing in en.ts: ${missingEn.join(', ')}`);
	assert.deepEqual(missingDe, [], `missing in de.ts: ${missingDe.join(', ')}`);
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
		for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in de)) missing.add(`${m[1]} (${file})`);
		for (const m of src.matchAll(/error: '([a-z]+\.[a-zA-Z0-9_.]+)'/g)) if (!(m[1] in de)) missing.add(`${m[1]} (${file})`);
	}
	// check the dynamically composed keys of the templates
	for (const s of SECTIONS) {
		for (const k of [`section.${s.kind}.title`, `section.${s.kind}.intro`, `entry.rhythm.${s.rhythm}`]) if (!(k in de)) missing.add(k);
		for (const f of s.fields) {
			if (!(`section.${s.kind}.${f.id}` in de)) missing.add(`section.${s.kind}.${f.id}`);
			if ((f.type === 'text' || f.type === 'textarea' || f.type === 'lines') && !(`section.${s.kind}.${f.id}.hint` in de))
				missing.add(`section.${s.kind}.${f.id}.hint`);
			for (const o of f.options ?? []) if (!(`emotion.${o}` in de)) missing.add(`emotion.${o}`);
		}
	}
	assert.deepEqual([...missing], []);
});

test('placeholders such as {count} are the same in both languages', () => {
	const vars = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(',');
	const differ = Object.keys(de).filter((k) => k in en && vars(de[k]) !== vars(en[k]));
	assert.deepEqual(differ, []);
});

test('singular forms (.one) have a base form, no text is empty', () => {
	const all = { ...de, ...en };
	const orphans = Object.keys(all).filter((k) => k.endsWith('.one') && !(k.slice(0, -4) in de));
	assert.deepEqual(orphans, []);
	const empty = [...Object.entries(de), ...Object.entries(en)].filter(([, v]) => !v.trim()).map(([k]) => k);
	assert.deepEqual(empty, []);
});

test('Swiss spelling: no "ß" in the German texts', () => {
	assert.deepEqual(Object.keys(de).filter((k) => de[k].includes('ß')), []);
});

test('welcome card: all texts exist', () => {
	// welcome.ts depends on the database – so read the steps from the source code
	const src = readFileSync('src/lib/server/welcome.ts', 'utf8');
	const steps = [...(src.match(/WELCOME_STEPS = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
	assert.ok(steps.length >= 5);
	const keys = steps.flatMap((s) => [`welcome.${s}`, `welcome.${s}.hint`]);
	assert.deepEqual(keys.filter((k) => !(k in de)), []);
});
