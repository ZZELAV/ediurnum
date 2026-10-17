import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffWords, hasChanges } from '../src/lib/diff.ts';

const show = (parts: ReturnType<typeof diffWords>) =>
	parts.map((p) => (p.kind === 'add' ? `[+${p.text}]` : p.kind === 'del' ? `[-${p.text}]` : p.text)).join('');
/** Text before or after, put together from the parts */
const before = (parts: ReturnType<typeof diffWords>) => parts.filter((p) => p.kind !== 'add').map((p) => p.text).join('');
const after = (parts: ReturnType<typeof diffWords>) => parts.filter((p) => p.kind !== 'del').map((p) => p.text).join('');

test('equal texts have no changes', () => {
	const parts = diffWords('Ein ruhiger Tag', 'Ein ruhiger Tag');
	assert.equal(hasChanges(parts), false);
	assert.equal(show(parts), 'Ein ruhiger Tag');
	assert.deepEqual(diffWords('', ''), []);
});

test('addition, removal and replacement', () => {
	assert.equal(show(diffWords('Kaffee gekocht.', 'Kaffee gekocht. Mit Lena telefoniert.')), 'Kaffee gekocht.[+ Mit Lena telefoniert.]');
	assert.equal(show(diffWords('Ein guter Tag', 'Ein schwerer Tag')), 'Ein [-guter][+schwerer] Tag');
	assert.equal(show(diffWords('Heute war schön', 'Heute schön')), 'Heute [-war ]schön');
	assert.equal(show(diffWords('Etwas', '')), '[-Etwas]');
	assert.equal(show(diffWords('', 'Neu')), '[+Neu]');
	assert.ok(hasChanges(diffWords('a', 'b')));
});

test('several replaced words appear as one block', () => {
	assert.equal(show(diffWords('Ich war sehr müde heute', 'Ich war richtig gut gelaunt heute')), 'Ich war [-sehr müde][+richtig gut gelaunt] heute');
});

test('line breaks and whitespace are kept', () => {
	const parts = diffWords('Zeile eins\nZeile zwei', 'Zeile eins\n\nZeile drei');
	assert.equal(after(parts), 'Zeile eins\n\nZeile drei');
	assert.equal(before(parts), 'Zeile eins\nZeile zwei');
});

test('before and after texts can always be recovered exactly', () => {
	const samples = [
		['Ein Tag am See.', 'Ein langer Tag am See, mit Lena.'],
		['a b c d e f', 'f e d c b a'],
		['  Leerraum vorne', 'Leerraum vorne  '],
		['Ümläute und Emoji 🌻', 'Umlaute und Emoji 🌻🌻']
	];
	for (const [a, b] of samples) {
		const parts = diffWords(a, b);
		assert.equal(before(parts), a);
		assert.equal(after(parts), b);
	}
});

test('random texts: before/after exact, no empty parts, no two parts of the same kind next to each other', () => {
	let seed = 42;
	const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
	const words = ['ich', 'war', 'heute', 'am', 'See', 'müde', 'froh', 'mit', 'Lena', '.'];
	const spaces = [' ', ' ', ' ', '  ', '\n', '\n\n'];
	const text = () =>
		Array.from({ length: Math.floor(rnd() * 12) }, () => words[Math.floor(rnd() * words.length)] + spaces[Math.floor(rnd() * spaces.length)]).join('');
	for (let i = 0; i < 500; i++) {
		const a = text();
		const b = rnd() < 0.3 ? a : text();
		const parts = diffWords(a, b);
		assert.equal(before(parts), a, JSON.stringify([a, b]));
		assert.equal(after(parts), b, JSON.stringify([a, b]));
		assert.ok(parts.every((p) => p.text.length > 0));
		assert.ok(parts.every((p, k) => k === 0 || parts[k - 1].kind !== p.kind));
		assert.equal(hasChanges(parts), a !== b);
	}
});

test('very long texts: the whole text as replaced instead of a long computation', () => {
	const a = Array.from({ length: 3000 }, (_, i) => `wort${i}`).join(' ');
	const b = Array.from({ length: 3000 }, (_, i) => `wort${i + 1}`).join(' ');
	const started = Date.now();
	const parts = diffWords(a, b);
	assert.ok(Date.now() - started < 1000);
	assert.equal(before(parts), a);
	assert.equal(after(parts), b);
	assert.deepEqual(parts.map((p) => p.kind), ['del', 'add']);
});
