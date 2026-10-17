/**
 * Cryptographic building blocks of ediurnum.
 *
 * Key hierarchy:
 *   master key (DEK, 32 random bytes)  = the user's recovery key
 *     ├─ encrypts all records (AES-256-GCM, the AAD binds a record to its ID)
 *     ├─ is stored in the DB "wrapped" with the password key (Argon2id)
 *     └─ together with the PIN it gives the lock key for locked entries
 *
 * Only functions from node:crypto are used (no native add-on packages).
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

/** Encrypts data: [version(1) | iv(12) | tag(16) | ciphertext] */
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
		throw new Error('Unknown encryption format');
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

/** Lock key for locked entries: derived from the master key + PIN key. */
export function deriveLockKey(dek: Buffer, pinKey: Buffer): Buffer {
	return Buffer.from(hkdfSync('sha256', Buffer.concat([dek, pinKey]), Buffer.alloc(0), 'ediurnum/lock/v1', KEY_LEN));
}

export async function lockKeyFromPin(dek: Buffer, pin: string, params: KdfParams): Promise<Buffer> {
	return deriveLockKey(dek, await deriveKey(pin, params));
}

// PIN check value (meta.pin_check): a known text, encrypted with the lock key
const PIN_CHECK_AAD = 'ediurnum/pin-check';
const PIN_CHECK_TEXT = 'ediurnum-pin-ok';

export function pinCheck(lockKey: Buffer): string {
	return encrypt(lockKey, PIN_CHECK_TEXT, PIN_CHECK_AAD).toString('base64');
}

/** Derives the lock key from the PIN and checks it against the check value; null for a wrong PIN. */
export async function unlockWithPin(dek: Buffer, pin: string, kdf: string, check: string): Promise<Buffer | null> {
	const lockKey = await lockKeyFromPin(dek, pin, JSON.parse(kdf) as KdfParams);
	try {
		return decrypt(lockKey, Buffer.from(check, 'base64'), PIN_CHECK_AAD).toString('utf8') === PIN_CHECK_TEXT ? lockKey : null;
	} catch {
		return null;
	}
}

/** Additional data (AAD) of the records – binds the encrypted content to entry and version or to the settings. */
export const entryAad = (id: string, revision: number) => `entry:${id}:rev:${revision}`;
export const SETTINGS_AAD = 'ediurnum/settings';

/** Short, non-secret fingerprint of a key (to compare backups). */
export function keyFingerprint(key: Buffer): string {
	return createHash('sha256').update('ediurnum/fingerprint/v1').update(key).digest('hex').slice(0, 16);
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

// ---------------------------------------------------------------------------
// Recovery key: Base32 (similar to Crockford, without easily confused
// characters) in groups of four plus a checksum, e.g. "K7QM-3XRD-…-9F2A".
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
	const body = base32Encode(key) + checksum(key); // 52 + 4 = 56 characters
	return body.match(/.{1,4}/g)!.join('-');
}

export function parseRecoveryKey(input: string): Buffer {
	const clean = input.toUpperCase().replace(/[\s-]/g, '');
	if (clean.length !== 56) throw new Error('recovery.invalidLength');
	const key = base32Decode(clean.slice(0, 52)).subarray(0, KEY_LEN);
	if (checksum(key) !== clean.slice(52)) throw new Error('recovery.invalidChecksum');
	return key;
}
