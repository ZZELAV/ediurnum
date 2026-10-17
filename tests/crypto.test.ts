import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	decrypt,
	decryptJson,
	defaultKdfParams,
	deriveKey,
	deriveLockKey,
	encrypt,
	encryptJson,
	formatRecoveryKey,
	generateKey,
	keyFingerprint,
	parseRecoveryKey,
	randomToken
} from '../src/lib/server/crypto.ts';

describe('AES-256-GCM', () => {
	test('Verschlüsseln und Entschlüsseln ergibt den Originaltext (auch Unicode)', () => {
		const key = generateKey();
		const text = 'Liebes Tagebuch … Grüsse 🌻';
		assert.equal(decrypt(key, encrypt(key, text, 'entry:1:rev:1'), 'entry:1:rev:1').toString('utf8'), text);
	});

	test('Gleicher Text ergibt jedes Mal anderen Geheimtext (zufälliger IV)', () => {
		const key = generateKey();
		assert.notDeepEqual(encrypt(key, 'gleich', 'a'), encrypt(key, 'gleich', 'a'));
	});

	test('Aufbau: Version 1, 12 Byte IV, 16 Byte Tag, dann Geheimtext', () => {
		const blob = encrypt(generateKey(), 'abc', 'a');
		assert.equal(blob[0], 1);
		assert.equal(blob.length, 1 + 12 + 16 + 3);
		assert.ok(!blob.includes(Buffer.from('abc')), 'kein Klartext im Ergebnis');
	});

	test('Falscher Kontext (AAD) oder falscher Schlüssel schlägt fehl', () => {
		const key = generateKey();
		const blob = encrypt(key, 'geheim', 'entry:1:rev:1');
		assert.throws(() => decrypt(key, blob, 'entry:2:rev:1'));
		assert.throws(() => decrypt(generateKey(), blob, 'entry:1:rev:1'));
	});

	test('Jede Veränderung wird erkannt (IV, Tag, Geheimtext, Version, Länge)', () => {
		const key = generateKey();
		const blob = encrypt(key, 'geheim', 'x');
		for (const i of [1, 13, 29, blob.length - 1]) {
			const copy = Buffer.from(blob);
			copy[i] ^= 1;
			assert.throws(() => decrypt(key, copy, 'x'), `Byte ${i}`);
		}
		const wrongVersion = Buffer.from(blob);
		wrongVersion[0] = 2;
		assert.throws(() => decrypt(key, wrongVersion, 'x'), /Unknown encryption format/);
		assert.throws(() => decrypt(key, blob.subarray(0, 20), 'x'), /Unknown encryption format/);
	});

	test('JSON hin und zurück', () => {
		const key = generateKey();
		const value = { mood: 4, sections: { daily: { gratitude: ['a', ''] } }, free: 'ü' };
		assert.deepEqual(decryptJson(key, encryptJson(key, value, 'k'), 'k'), value);
	});
});

describe('Wiederherstellungsschlüssel', () => {
	test('Format: 14 Vierergruppen aus A–Z (ohne I, O) und 2–9', () => {
		for (let i = 0; i < 50; i++) {
			const key = generateKey();
			const text = formatRecoveryKey(key);
			assert.match(text, /^([A-HJ-NP-Z2-9]{4}-){13}[A-HJ-NP-Z2-9]{4}$/);
			assert.ok(parseRecoveryKey(text).equals(key));
		}
	});

	test('Kleinschreibung, Leerzeichen und fehlende Bindestriche sind erlaubt', () => {
		const key = generateKey();
		const text = formatRecoveryKey(key);
		assert.ok(parseRecoveryKey(text.toLowerCase()).equals(key));
		assert.ok(parseRecoveryKey(text.replaceAll('-', ' ')).equals(key));
		assert.ok(parseRecoveryKey(text.replaceAll('-', '')).equals(key));
		assert.ok(parseRecoveryKey(`  ${text}\n`).equals(key));
	});

	test('Fehler haben Textschlüssel für die Oberfläche', () => {
		const text = formatRecoveryKey(generateKey());
		assert.throws(() => parseRecoveryKey('ABCD'), /^Error: recovery\.invalidLength$/);
		assert.throws(() => parseRecoveryKey(text + 'A'), /recovery\.invalidLength/);
		assert.throws(() => parseRecoveryKey('O' + text.slice(1)), /^Error: recovery\.invalidChars$/);
		assert.throws(() => parseRecoveryKey('0' + text.slice(1)), /recovery\.invalidChars/);
		const typo = (text[0] === 'A' ? 'B' : 'A') + text.slice(1);
		assert.throws(() => parseRecoveryKey(typo), /^Error: recovery\.invalidChecksum$/);
	});
});

describe('Schlüsselableitung', () => {
	const fast = () => ({ ...defaultKdfParams(), memory: 8192, passes: 1 });

	test('Standard: Argon2id, 64 MiB, 3 Durchgänge, zufälliges Salz', () => {
		const a = defaultKdfParams();
		assert.equal(a.algorithm, 'argon2id');
		assert.equal(a.memory, 65536);
		assert.equal(a.passes, 3);
		assert.equal(Buffer.from(a.salt, 'base64').length, 16);
		assert.notEqual(a.salt, defaultKdfParams().salt);
	});

	test('Deterministisch, passwort- und salzabhängig', async () => {
		const params = fast();
		const a = await deriveKey('ein langes Passwort', params);
		assert.equal(a.length, 32);
		assert.ok(a.equals(await deriveKey('ein langes Passwort', params)));
		assert.ok(!a.equals(await deriveKey('ein anderes Passwort', params)));
		assert.ok(!a.equals(await deriveKey('ein langes Passwort', fast())));
	});

	test('Umlaute zählen gleich, egal wie sie eingegeben werden (NFC/NFD)', async () => {
		const params = fast();
		const composed = 'Grüsse aus Zürich';
		const decomposed = composed.normalize('NFD');
		assert.notEqual(composed, decomposed);
		assert.ok((await deriveKey(composed, params)).equals(await deriveKey(decomposed, params)));
	});

	test('Sperr-Schlüssel hängt von Hauptschlüssel und PIN ab', () => {
		const dek = generateKey();
		const pinA = generateKey();
		const lock = deriveLockKey(dek, pinA);
		assert.equal(lock.length, 32);
		assert.ok(lock.equals(deriveLockKey(dek, pinA)));
		assert.ok(!lock.equals(deriveLockKey(dek, generateKey())));
		assert.ok(!lock.equals(deriveLockKey(generateKey(), pinA)));
	});
});

describe('Hilfsfunktionen', () => {
	test('Fingerabdruck: kurz, stabil, verrät den Schlüssel nicht', () => {
		const key = generateKey();
		const fp = keyFingerprint(key);
		assert.match(fp, /^[0-9a-f]{16}$/);
		assert.equal(fp, keyFingerprint(Buffer.from(key)));
		assert.notEqual(fp, keyFingerprint(generateKey()));
		assert.ok(!key.toString('hex').includes(fp));
	});

	test('Zufällige Tokens sind URL-tauglich und verschieden', () => {
		const a = randomToken();
		assert.match(a, /^[A-Za-z0-9_-]{43}$/);
		assert.notEqual(a, randomToken());
	});
});
