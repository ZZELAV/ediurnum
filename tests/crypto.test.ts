import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	decrypt,
	defaultKdfParams,
	deriveKey,
	deriveLockKey,
	encrypt,
	formatRecoveryKey,
	generateKey,
	parseRecoveryKey
} from '../src/lib/server/crypto.ts';

test('Verschlüsseln und Entschlüsseln ergibt den Originaltext', () => {
	const key = generateKey();
	const blob = encrypt(key, 'Liebes Tagebuch …', 'entry:1:rev:1');
	assert.equal(decrypt(key, blob, 'entry:1:rev:1').toString('utf8'), 'Liebes Tagebuch …');
});

test('Falscher Kontext (AAD) oder falscher Schlüssel schlägt fehl', () => {
	const key = generateKey();
	const blob = encrypt(key, 'geheim', 'entry:1:rev:1');
	assert.throws(() => decrypt(key, blob, 'entry:2:rev:1'));
	assert.throws(() => decrypt(generateKey(), blob, 'entry:1:rev:1'));
});

test('Manipulierte Daten werden erkannt', () => {
	const key = generateKey();
	const blob = encrypt(key, 'geheim', 'x');
	blob[blob.length - 1] ^= 1;
	assert.throws(() => decrypt(key, blob, 'x'));
});

test('Wiederherstellungsschlüssel: Format und Rückumwandlung', () => {
	const key = generateKey();
	const text = formatRecoveryKey(key);
	assert.match(text, /^([A-Z2-9]{4}-){13}[A-Z2-9]{4}$/);
	assert.ok(parseRecoveryKey(text).equals(key));
	assert.ok(parseRecoveryKey(text.toLowerCase().replaceAll('-', ' ')).equals(key));
});

test('Tippfehler im Wiederherstellungsschlüssel wird erkannt', () => {
	const text = formatRecoveryKey(generateKey());
	const typo = (text[0] === 'A' ? 'B' : 'A') + text.slice(1);
	assert.throws(() => parseRecoveryKey(typo), /recovery\.invalidChecksum/);
	assert.throws(() => parseRecoveryKey('ABCD'), /recovery\.invalidLength/);
});

test('Argon2id-Ableitung ist deterministisch und passwortabhängig', async () => {
	const params = { ...defaultKdfParams(), memory: 8192, passes: 1 };
	const a = await deriveKey('ein langes Passwort', params);
	const b = await deriveKey('ein langes Passwort', params);
	const c = await deriveKey('ein anderes Passwort', params);
	assert.ok(a.equals(b));
	assert.ok(!a.equals(c));
});

test('Sperr-Schlüssel hängt von Hauptschlüssel und PIN ab', () => {
	const dek = generateKey();
	const pinA = generateKey();
	const pinB = generateKey();
	assert.ok(!deriveLockKey(dek, pinA).equals(deriveLockKey(dek, pinB)));
	assert.ok(!deriveLockKey(dek, pinA).equals(deriveLockKey(generateKey(), pinA)));
});
