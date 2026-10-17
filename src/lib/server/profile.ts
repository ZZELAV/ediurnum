import { decryptJson, encryptJson } from './crypto.ts';
import { getMeta, nowIso, setMeta } from './db.ts';
import { emptyProfile, sanitizeProfile, type Profile } from '#lib/profile.ts';

/** Self-assessment – like all content stored only encrypted. */
const AAD = 'ediurnum/profile';

export function loadProfile(dek: Buffer): Profile {
	const raw = getMeta('profile');
	if (!raw) return emptyProfile();
	return sanitizeProfile(decryptJson<Profile>(dek, Buffer.from(raw, 'base64'), AAD));
}

export function saveProfile(dek: Buffer, input: unknown): Profile {
	const profile = { ...sanitizeProfile(input), updatedAt: nowIso() };
	setMeta('profile', encryptJson(dek, profile, AAD).toString('base64'));
	return profile;
}

export function hasProfile(): boolean {
	return getMeta('profile') !== null;
}
