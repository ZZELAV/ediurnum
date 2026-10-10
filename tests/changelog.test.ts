import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changelogSection } from '../src/lib/changelog.ts';

const md = readFileSync('CHANGELOG.md', 'utf8');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

test('CHANGELOG: Abschnitt der aktuellen Version ohne Linkverweise, kein [Unreleased]', () => {
	const section = changelogSection(md, version);
	assert.ok(section);
	assert.equal(section.version, version);
	assert.doesNotMatch(section.body, /^\[[^\]]+\]: http/m);
	assert.doesNotMatch(md, /\[Unreleased\]/);
});

test('CHANGELOG: package.json und package-lock.json haben dieselbe Version', () => {
	const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
	assert.equal(lock.version, version);
	assert.equal(lock.packages[''].version, version);
});

test('CHANGELOG: veröffentlichte Versionen haben ein Datum und einen Vergleichslink', () => {
	const headings = [...md.matchAll(/^## \[([^\]]+)\](.*)$/gm)].map((m) => ({ version: m[1], rest: m[2] }));
	for (const h of headings.slice(1)) {
		assert.match(h.rest, / - \d{4}-\d\d-\d\d$/, `${h.version} ohne Datum`);
		assert.match(md, new RegExp(`^\\[${h.version.replace(/\./g, '\\.')}\\]: https://github\\.com/ZZELAV/ediurnum/`, 'm'), `${h.version} ohne Link`);
	}
	assert.equal(headings[0].version, version, 'oberster Abschnitt = Version in package.json');
});

test('Abschnitt: unbekannte Version liefert den obersten, Datum wird erkannt', () => {
	const sample = '# Changelog\r\n\r\n## [1.1.0]\r\n\r\n- neu\r\n\r\n## [1.0.0] - 2026-01-02\r\n\r\n- alt\r\n\r\n[1.0.0]: https://example.com\r\n';
	assert.deepEqual(changelogSection(sample, '9.9.9'), { version: '1.1.0', date: '', body: '- neu' });
	assert.deepEqual(changelogSection(sample, '1.0.0'), { version: '1.0.0', date: '2026-01-02', body: '- alt' });
	assert.equal(changelogSection('# leer', '1.0.0'), null);
});
