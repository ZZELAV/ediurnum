/**
 * Kryptografie-Bausteine von ediurnum.
 *
 * Schlüsselhierarchie:
 *   Hauptschlüssel (DEK, 32 Byte zufällig)  = Wiederherstellungsschlüssel des Users
 *     ├─ verschlüsselt alle Datensätze (AES-256-GCM, AAD bindet den Datensatz an seine ID)
 *     ├─ wird mit dem Passwort-Schlüssel (Argon2id) "eingepackt" in der DB gespeichert
 *     └─ zusammen mit der PIN ergibt er den Sperr-Schlüssel für gesperrte Einträge
 *
 * Es werden ausschliesslich Funktionen aus node:crypto verwendet (keine nativen Zusatzpakete).
 */
import {
	argon2,
	createCipheriv,
	createDecipheriv,
	createHash,
	hkdfSync,
	randomBytes
} from 'node:crypto';

const FORMAT_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export interface KdfParams {
	algorithm: 'argon2id';
	memory: number; // KiB
	passes: number;
	parallelism: number;
	salt: string; // base64
}

export function defaultKdfParams(): KdfParams {
	return {
		algorithm: 'argon2id',
		memory: 65536, // 64 MiB
		passes: 3,
		parallelism: 1,
		salt: randomBytes(16).toString('base64')
	};
}

export function deriveKey(secret: string, params: KdfParams): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		argon2(
			params.algorithm,
			{
				message: Buffer.from(secret.normalize('NFKC'), 'utf8'),
				nonce: Buffer.from(params.salt, 'base64'),
				parallelism: params.parallelism,
				tagLength: KEY_LEN,
				memory: params.memory,
				passes: params.passes
			},
			(err, key) => (err ? reject(err) : resolve(Buffer.from(key)))
		);
	});
}

export function generateKey(): Buffer {
	return randomBytes(KEY_LEN);
}

/** Verschlüsselt Daten: [version(1) | iv(12) | tag(16) | ciphertext] */
export function encrypt(key: Buffer, plaintext: Buffer | string, aad: string): Buffer {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
	const ct = Buffer.concat([cipher.update(data), cipher.final()]);
	return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), ct]);
}

export function decrypt(key: Buffer, blob: Uint8Array, aad: string): Buffer {
	const buf = Buffer.from(blob);
	if (buf.length < 1 + IV_LEN + TAG_LEN || buf[0] !== FORMAT_VERSION) {
		throw new Error('Unbekanntes Verschlüsselungsformat');
	}
	const iv = buf.subarray(1, 1 + IV_LEN);
	const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
	const ct = buf.subarray(1 + IV_LEN + TAG_LEN);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAAD(Buffer.from(aad, 'utf8'));
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function encryptJson(key: Buffer, value: unknown, aad: string): Buffer {
	return encrypt(key, JSON.stringify(value), aad);
}

export function decryptJson<T>(key: Buffer, blob: Uint8Array, aad: string): T {
	return JSON.parse(decrypt(key, blob, aad).toString('utf8')) as T;
}

/** Sperr-Schlüssel für gesperrte Einträge: abgeleitet aus Hauptschlüssel + PIN-Schlüssel. */
export function deriveLockKey(dek: Buffer, pinKey: Buffer): Buffer {
	return Buffer.from(hkdfSync('sha256', Buffer.concat([dek, pinKey]), Buffer.alloc(0), 'ediurnum/lock/v1', KEY_LEN));
}

export async function lockKeyFromPin(dek: Buffer, pin: string, params: KdfParams): Promise<Buffer> {
	return deriveLockKey(dek, await deriveKey(pin, params));
}

// Prüfwert der PIN (meta.pin_check): ein bekannter Text, mit dem Sperr-Schlüssel verschlüsselt
const PIN_CHECK_AAD = 'ediurnum/pin-check';
const PIN_CHECK_TEXT = 'ediurnum-pin-ok';

export function pinCheck(lockKey: Buffer): string {
	return encrypt(lockKey, PIN_CHECK_TEXT, PIN_CHECK_AAD).toString('base64');
}

/** Leitet aus der PIN den Sperr-Schlüssel ab und prüft ihn am Prüfwert; null bei falscher PIN. */
export async function unlockWithPin(dek: Buffer, pin: string, kdf: string, check: string): Promise<Buffer | null> {
	const lockKey = await lockKeyFromPin(dek, pin, JSON.parse(kdf) as KdfParams);
	try {
		return decrypt(lockKey, Buffer.from(check, 'base64'), PIN_CHECK_AAD).toString('utf8') === PIN_CHECK_TEXT ? lockKey : null;
	} catch {
		return null;
	}
}

/** Zusatzdaten (AAD) der Datensätze – binden den verschlüsselten Inhalt an Eintrag und Version bzw. an die Einstellungen. */
export const entryAad = (id: string, revision: number) => `entry:${id}:rev:${revision}`;
export const SETTINGS_AAD = 'ediurnum/settings';

/** Kurzer, nicht geheimer Fingerabdruck eines Schlüssels (zum Vergleichen von Backups). */
export function keyFingerprint(key: Buffer): string {
	return createHash('sha256').update('ediurnum/fingerprint/v1').update(key).digest('hex').slice(0, 16);
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

// ---------------------------------------------------------------------------
// Wiederherstellungsschlüssel: Base32 (Crockford-ähnlich, ohne verwechselbare
// Zeichen) in Vierergruppen plus Prüfsumme, z. B. "K7QM-3XRD-…-9F2A".
// ---------------------------------------------------------------------------
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base32Encode(buf: Buffer): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of buf) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	return out;
}

function base32Decode(str: string): Buffer {
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of str) {
		const idx = B32.indexOf(ch);
		if (idx === -1) throw new Error('recovery.invalidChars');
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

function checksum(key: Buffer): string {
	return base32Encode(createHash('sha256').update(key).digest()).slice(0, 4);
}

export function formatRecoveryKey(key: Buffer): string {
	const body = base32Encode(key) + checksum(key); // 52 + 4 = 56 Zeichen
	return body.match(/.{1,4}/g)!.join('-');
}

export function parseRecoveryKey(input: string): Buffer {
	const clean = input.toUpperCase().replace(/[\s-]/g, '');
	if (clean.length !== 56) throw new Error('recovery.invalidLength');
	const key = base32Decode(clean.slice(0, 52)).subarray(0, KEY_LEN);
	if (checksum(key) !== clean.slice(52)) throw new Error('recovery.invalidChecksum');
	return key;
}
