import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffWords, hasChanges } from '../src/lib/diff.ts';

const show = (parts: ReturnType<typeof diffWords>) =>
	parts.map((p) => (p.kind === 'add' ? `[+${p.text}]` : p.kind === 'del' ? `[-${p.text}]` : p.text)).join('');

test('Gleiche Texte haben keine Änderungen', () => {
	const parts = diffWords('Ein ruhiger Tag', 'Ein ruhiger Tag');
	assert.equal(hasChanges(parts), false);
	assert.equal(show(parts), 'Ein ruhiger Tag');
});

test('Ergänzung am Ende wird als hinzugefügt markiert', () => {
	assert.equal(show(diffWords('Kaffee gekocht.', 'Kaffee gekocht. Mit Lena telefoniert.')), 'Kaffee gekocht.[+ Mit Lena telefoniert.]');
});

test('Ersetztes Wort: alt gestrichen, neu hinzugefügt', () => {
	assert.equal(show(diffWords('Ein guter Tag', 'Ein schwerer Tag')), 'Ein [-guter][+schwerer] Tag');
});

test('Gelöschter Text und leere Felder', () => {
	assert.equal(show(diffWords('Etwas', '')), '[-Etwas]');
	assert.equal(show(diffWords('', 'Neu')), '[+Neu]');
	assert.deepEqual(diffWords('', ''), []);
});

test('Zeilenumbrüche bleiben erhalten', () => {
	const after = diffWords('Zeile eins\nZeile zwei', 'Zeile eins\nZeile drei');
	assert.equal(after.map((p) => p.text).join('').includes('\n'), true);
	assert.equal(show(after), 'Zeile eins\nZeile [-zwei][+drei]');
});
