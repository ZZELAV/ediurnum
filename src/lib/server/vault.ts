import {
	decrypt,
	defaultKdfParams,
	deriveKey,
	encrypt,
	formatRecoveryKey,
	generateKey,
	keyFingerprint,
	lockKeyFromPin,
	pinCheck,
	randomToken,
	unlockWithPin,
	type KdfParams
} from './crypto.ts';
import { getMeta, nowIso, setMeta, transaction } from './db.ts';
import { log } from './log.ts';
import { MAX_PASSWORD, validatePin } from './validation.ts';

/**
 * Vault: manages the master key. It exists decrypted only in
 * memory and only within an active session.
 */

const WRAP_AAD = 'ediurnum/wrapped-dek';

export interface Session {
	token: string;
	dek: Buffer;
	createdAt: number;
	lastSeen: number;
	/** Lock when the app has been left for this long (0 = off) */
	awayMs: number;
	/** Since when the app has been left (0 = in the foreground), see #lib/away */
	awaySince: number;
	lockKey: Buffer | null;
	lockUntil: number;
}

/**
 * State in memory. Lives on globalThis so it survives a reload of the server code:
 * the dev server reloads the modules on every change – otherwise you would be signed out after every save.
 * In production the modules are loaded only once.
 */
interface VaultState {
	sessions: Map<string, Session>;
	attempts: Map<string, { count: number; until: number }>;
	sweeper?: ReturnType<typeof setInterval>;
}
const state: VaultState = ((globalThis as unknown as Record<symbol, VaultState>)[Symbol.for('ediurnum.vault')] ??= {
	sessions: new Map(),
	attempts: new Map()
});
const sessions = state.sessions;
const ABSOLUTE_MAX_MS = 12 * 60 * 60 * 1000;
const PIN_UNLOCK_MS = 10 * 60 * 1000;

export function isInitialized(): boolean {
	return getMeta('wrapped_dek') !== null;
}

function storeWrappedKey(dek: Buffer, kek: Buffer, params: KdfParams) {
	setMeta('kdf', JSON.stringify(params));
	setMeta('wrapped_dek', encrypt(kek, dek, WRAP_AAD).toString('base64'));
}

/** Creates a new journal. Returns the recovery key (visible only once!). */
export async function initialize(password: string, dek: Buffer = generateKey()): Promise<string> {
	if (isInitialized()) throw new Error('already-initialized');
	const params = defaultKdfParams();
	const kek = await deriveKey(password, params);
	transaction(() => {
		// check again: a second setup could have come first while the key was being derived
		if (isInitialized()) throw new Error('already-initialized');
		storeWrappedKey(dek, kek, params);
		setMeta('key_fp', keyFingerprint(dek));
		setMeta('created_at', nowIso());
	});
	return formatRecoveryKey(dek);
}

export async function unlockWithPassword(password: string): Promise<Buffer | null> {
	const kdf = getMeta('kdf');
	const wrapped = getMeta('wrapped_dek');
	if (!kdf || !wrapped || password.length > MAX_PASSWORD) return null;
	const kek = await deriveKey(password, JSON.parse(kdf) as KdfParams);
	try {
		return decrypt(kek, Buffer.from(wrapped, 'base64'), WRAP_AAD);
	} catch {
		return null;
	}
}

export function matchesStoredKey(dek: Buffer): boolean {
	return getMeta('key_fp') === keyFingerprint(dek);
}

/** Sets a new password (after signing in or with the recovery key). */
export async function setPassword(dek: Buffer, newPassword: string) {
	const params = defaultKdfParams();
	const kek = await deriveKey(newPassword, params);
	transaction(() => storeWrappedKey(dek, kek, params));
}

// --------------------------------------------------------------------------
// Sessions
// --------------------------------------------------------------------------

export function createSession(dek: Buffer, leaveMinutes = 0): Session {
	const now = Date.now();
	const s: Session = {
		token: randomToken(),
		dek,
		createdAt: now,
		lastSeen: now,
		awayMs: Math.max(0, leaveMinutes) * 60 * 1000,
		awaySince: 0,
		lockKey: null,
		lockUntil: 0
	};
	sessions.set(s.token, s);
	return s;
}

/**
 * Ends the session if it has expired (maximum duration, app left) and closes an
 * expired PIN. Doesn't count as activity itself – otherwise the regular clean-up would keep every session open.
 */
function expire(token: string, s: Session, now: number): boolean {
	const left = s.awayMs > 0 && s.awaySince > 0 && now - s.awaySince > s.awayMs;
	if (now - s.createdAt > ABSOLUTE_MAX_MS || left) {
		const reason = left ? 'left-app' : 'max-duration';
		log.info('journal closed automatically', { reason });
		destroySession(token);
		return true;
	}
	if (s.lockKey && now > s.lockUntil) {
		s.lockKey.fill(0);
		s.lockKey = null;
	}
	return false;
}

/** Session of a request; the request counts as activity. */
export function getSession(token: string | undefined): Session | null {
	if (!token) return null;
	const s = sessions.get(token);
	if (!s) return null;
	const now = Date.now();
	if (expire(token, s, now)) return null;
	s.lastSeen = now;
	return s;
}

/** The app was left (closed, in the background, screen locked) or is in the foreground again. */
export function markAway(s: Session, away: boolean) {
	s.awaySince = away ? Date.now() : 0;
}

export function destroySession(token: string) {
	const s = sessions.get(token);
	if (s) {
		s.dek.fill(0);
		s.lockKey?.fill(0);
		sessions.delete(token);
	}
}

export function destroyAllSessions() {
	for (const token of [...sessions.keys()]) destroySession(token);
}

/** Ends all sessions except this one (e.g. after changing the password). Returns their number. */
export function destroyOtherSessions(keep: Session): number {
	let n = 0;
	for (const [token, s] of [...sessions]) {
		if (s === keep) continue;
		destroySession(token);
		n++;
	}
	return n;
}

/** Closes the open PIN in all other sessions – their lock key is no longer valid after a PIN change. */
export function closePinInOtherSessions(keep: Session) {
	for (const s of sessions.values()) {
		if (s === keep || !s.lockKey) continue;
		s.lockKey.fill(0);
		s.lockKey = null;
		s.lockUntil = 0;
	}
}

// end expired sessions even without a request (keys out of memory) – without extending them
if (state.sweeper) clearInterval(state.sweeper);
state.sweeper = setInterval(() => {
	const now = Date.now();
	for (const [token, s] of [...sessions]) expire(token, s, now);
}, 60_000).unref();

// --------------------------------------------------------------------------
// PIN for locked entries
// --------------------------------------------------------------------------

export function hasPin(): boolean {
	return getMeta('pin_kdf') !== null;
}

/** Checks the PIN and returns the lock key (or null). */
export async function verifyPin(dek: Buffer, pin: string): Promise<Buffer | null> {
	const kdf = getMeta('pin_kdf');
	const check = getMeta('pin_check');
	// don't even derive an invalid format (saves Argon2 for nonsense input)
	if (!kdf || !check || validatePin(pin) !== null) return null;
	return unlockWithPin(dek, pin, kdf, check);
}

/** Computes a new lock key for a new PIN (the caller saves it). */
export async function prepareNewPin(dek: Buffer, pin: string) {
	const params = defaultKdfParams();
	params.memory = 32768;
	const lockKey = await lockKeyFromPin(dek, pin, params);
	const check = pinCheck(lockKey);
	return {
		lockKey,
		commit: () => {
			setMeta('pin_kdf', JSON.stringify(params));
			setMeta('pin_check', check);
		}
	};
}

export function unlockPinForSession(session: Session, lockKey: Buffer) {
	session.lockKey?.fill(0);
	session.lockKey = lockKey;
	session.lockUntil = Date.now() + PIN_UNLOCK_MS;
}

export function relockSession(session: Session) {
	session.lockKey?.fill(0);
	session.lockKey = null;
	session.lockUntil = 0;
}

// --------------------------------------------------------------------------
// Simple brake against guessing passwords/PINs
// --------------------------------------------------------------------------

const attempts = state.attempts;

/** Returns the remaining lockout in seconds (0 = allowed). */
export function throttleRemaining(key: string): number {
	const a = attempts.get(key);
	if (!a || Date.now() > a.until) return 0;
	return Math.ceil((a.until - Date.now()) / 1000);
}

export function registerFailure(key: string) {
	const a = attempts.get(key) ?? { count: 0, until: 0 };
	a.count += 1;
	// from the 5th failed attempt: 30 s, 60 s, 120 s … (max. 1 h)
	a.until = a.count >= 5 ? Date.now() + Math.min(3600, 30 * 2 ** (a.count - 5)) * 1000 : 0;
	attempts.set(key, a);
	log.warn('failed attempt', { key, count: a.count, blockedSeconds: a.until ? Math.ceil((a.until - Date.now()) / 1000) : 0 });
}

export function registerSuccess(key: string) {
	attempts.delete(key);
}
