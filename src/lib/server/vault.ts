import {
	decrypt,
	defaultKdfParams,
	deriveKey,
	deriveLockKey,
	encrypt,
	formatRecoveryKey,
	generateKey,
	keyFingerprint,
	randomToken,
	type KdfParams
} from './crypto';
import { getMeta, nowIso, setMeta, transaction } from './db';
import { log } from './log';
import { MAX_PASSWORD, validatePin } from './validation';

/**
 * Tresor: verwaltet den Hauptschlüssel. Er existiert entschlüsselt nur im
 * Arbeitsspeicher und nur innerhalb einer aktiven Sitzung.
 */

const WRAP_AAD = 'ediurnum/wrapped-dek';
const PIN_CHECK_AAD = 'ediurnum/pin-check';
const PIN_CHECK_TEXT = 'ediurnum-pin-ok';

export interface Session {
	token: string;
	dek: Buffer;
	createdAt: number;
	lastSeen: number;
	idleMs: number;
	lockKey: Buffer | null;
	lockUntil: number;
}

/**
 * Zustand im Arbeitsspeicher. Liegt auf globalThis, damit er ein Neuladen des Server-Codes übersteht:
 * Der Dev-Server lädt die Module bei jeder Änderung neu – sonst wäre man nach jedem Speichern abgemeldet.
 * Im Produktivbetrieb werden die Module nur einmal geladen.
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
export const PIN_UNLOCK_MS = 10 * 60 * 1000;

export function isInitialized(): boolean {
	return getMeta('wrapped_dek') !== null;
}

function storeWrappedKey(dek: Buffer, kek: Buffer, params: KdfParams) {
	setMeta('kdf', JSON.stringify(params));
	setMeta('wrapped_dek', encrypt(kek, dek, WRAP_AAD).toString('base64'));
}

/** Erstellt ein neues Tagebuch. Gibt den Wiederherstellungsschlüssel zurück (nur einmal sichtbar!). */
export async function initialize(password: string, dek: Buffer = generateKey()): Promise<string> {
	if (isInitialized()) throw new Error('already-initialized');
	const params = defaultKdfParams();
	const kek = await deriveKey(password, params);
	transaction(() => {
		// Nochmals prüfen: Während der Ableitung könnte eine zweite Einrichtung zuvorgekommen sein
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

/** Neues Passwort setzen (nach Login oder mit dem Wiederherstellungsschlüssel). */
export async function setPassword(dek: Buffer, newPassword: string) {
	const params = defaultKdfParams();
	const kek = await deriveKey(newPassword, params);
	transaction(() => storeWrappedKey(dek, kek, params));
}

// --------------------------------------------------------------------------
// Sitzungen
// --------------------------------------------------------------------------

export function createSession(dek: Buffer, idleMinutes: number): Session {
	const now = Date.now();
	const s: Session = {
		token: randomToken(),
		dek,
		createdAt: now,
		lastSeen: now,
		idleMs: Math.max(5, idleMinutes) * 60 * 1000,
		lockKey: null,
		lockUntil: 0
	};
	sessions.set(s.token, s);
	return s;
}

export function getSession(token: string | undefined): Session | null {
	if (!token) return null;
	const s = sessions.get(token);
	if (!s) return null;
	const now = Date.now();
	if (now - s.lastSeen > s.idleMs || now - s.createdAt > ABSOLUTE_MAX_MS) {
		log.info('journal closed automatically', { reason: now - s.createdAt > ABSOLUTE_MAX_MS ? 'max-duration' : 'inactivity' });
		destroySession(token);
		return null;
	}
	s.lastSeen = now;
	if (s.lockKey && now > s.lockUntil) {
		s.lockKey.fill(0);
		s.lockKey = null;
	}
	return s;
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

if (state.sweeper) clearInterval(state.sweeper);
state.sweeper = setInterval(() => {
	for (const token of [...sessions.keys()]) getSession(token);
}, 60_000).unref();

// --------------------------------------------------------------------------
// PIN für gesperrte Einträge
// --------------------------------------------------------------------------

export function hasPin(): boolean {
	return getMeta('pin_kdf') !== null;
}

async function lockKeyFromPin(dek: Buffer, pin: string, params: KdfParams): Promise<Buffer> {
	const pinKey = await deriveKey(pin, params);
	return deriveLockKey(dek, pinKey);
}

/** Prüft die PIN und liefert den Sperr-Schlüssel (oder null). */
export async function verifyPin(dek: Buffer, pin: string): Promise<Buffer | null> {
	const kdf = getMeta('pin_kdf');
	const check = getMeta('pin_check');
	// Ungültiges Format gar nicht erst ableiten (spart Argon2 bei unsinnigen Eingaben)
	if (!kdf || !check || validatePin(pin) !== null) return null;
	const lockKey = await lockKeyFromPin(dek, pin, JSON.parse(kdf) as KdfParams);
	try {
		const ok = decrypt(lockKey, Buffer.from(check, 'base64'), PIN_CHECK_AAD).toString('utf8') === PIN_CHECK_TEXT;
		return ok ? lockKey : null;
	} catch {
		return null;
	}
}

/** Berechnet einen neuen Sperr-Schlüssel für eine neue PIN (Speichern erfolgt im Aufrufer). */
export async function prepareNewPin(dek: Buffer, pin: string) {
	const params = defaultKdfParams();
	params.memory = 32768;
	const lockKey = await lockKeyFromPin(dek, pin, params);
	const check = encrypt(lockKey, PIN_CHECK_TEXT, PIN_CHECK_AAD).toString('base64');
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
// Einfache Bremse gegen das Durchprobieren von Passwort/PIN
// --------------------------------------------------------------------------

const attempts = state.attempts;

/** Gibt die verbleibende Sperrzeit in Sekunden zurück (0 = erlaubt). */
export function throttleRemaining(key: string): number {
	const a = attempts.get(key);
	if (!a || Date.now() > a.until) return 0;
	return Math.ceil((a.until - Date.now()) / 1000);
}

export function registerFailure(key: string) {
	const a = attempts.get(key) ?? { count: 0, until: 0 };
	a.count += 1;
	// Ab dem 5. Fehlversuch: 30 s, 60 s, 120 s … (max. 1 h)
	a.until = a.count >= 5 ? Date.now() + Math.min(3600, 30 * 2 ** (a.count - 5)) * 1000 : 0;
	attempts.set(key, a);
	log.warn('failed attempt', { key, count: a.count, blockedSeconds: a.until ? Math.ceil((a.until - Date.now()) / 1000) : 0 });
}

export function registerSuccess(key: string) {
	attempts.delete(key);
}
