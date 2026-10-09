import { randomUUID } from 'node:crypto';
import { decryptJson, encryptJson } from './crypto';
import { getDb, nowIso, transaction } from './db';
import type { Session } from './vault';
import { filledKinds, isEmptyContent } from '$lib/templates';
import type { Entry, EntryContent, EntryMeta, RevisionInfo, SectionKind } from '$lib/types';

/** Änderungen innerhalb dieses Zeitfensters werden in derselben Version zusammengefasst. */
const REVISION_WINDOW_MS = 10 * 60 * 1000;

interface EntryRow {
	id: string;
	date: string;
	kinds: string;
	locked: number;
	ai_allowed: number;
	revision: number;
	rev_started_at: string;
	created_at: string;
	updated_at: string;
	payload: Uint8Array;
}

interface RevisionRow {
	entry_id: string;
	revision: number;
	created_at: string;
	saved_at: string;
	locked: number;
	payload: Uint8Array;
}

export class LockedError extends Error {
	constructor() {
		super('locked');
	}
}

const aad = (id: string, revision: number) => `entry:${id}:rev:${revision}`;

function toMeta(r: EntryRow): EntryMeta {
	return {
		id: r.id,
		date: r.date,
		kinds: (r.kinds ? r.kinds.split(',') : []) as SectionKind[],
		locked: r.locked === 1,
		aiAllowed: r.ai_allowed === 1,
		revision: r.revision,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

function keyFor(session: Session, locked: boolean): Buffer | null {
	return locked ? session.lockKey : session.dek;
}

function requireKey(session: Session, locked: boolean): Buffer {
	const key = keyFor(session, locked);
	if (!key) throw new LockedError();
	return key;
}

function rowByDate(date: string): EntryRow | undefined {
	return getDb().prepare('SELECT * FROM entries WHERE date = ?').get(date) as EntryRow | undefined;
}

export function listEntryMeta(): EntryMeta[] {
	const rows = getDb()
		.prepare(
			'SELECT id, date, kinds, locked, ai_allowed, revision, rev_started_at, created_at, updated_at FROM entries ORDER BY date DESC'
		)
		.all() as unknown as EntryRow[];
	return rows.map(toMeta);
}

export function getEntry(session: Session, date: string): Entry | null {
	const row = rowByDate(date);
	if (!row) return null;
	const key = keyFor(session, row.locked === 1);
	return {
		...toMeta(row),
		content: key ? decryptJson<EntryContent>(key, row.payload, aad(row.id, row.revision)) : null
	};
}

/**
 * Speichert den Eintrag eines Tages. Jede Bearbeitung, die mehr als
 * REVISION_WINDOW_MS nach Beginn der aktuellen Version stattfindet,
 * archiviert die bisherige Fassung als eigene Version.
 */
export function saveEntry(
	session: Session,
	date: string,
	content: EntryContent,
	opts: { forceNewRevision?: boolean } = {}
): EntryMeta | null {
	const row = rowByDate(date);
	const now = nowIso();
	const kinds = filledKinds(content).join(',');

	if (!row) {
		if (isEmptyContent(content)) return null;
		const id = randomUUID();
		getDb()
			.prepare(
				`INSERT INTO entries (id, date, kinds, locked, ai_allowed, revision, rev_started_at, created_at, updated_at, payload)
				 VALUES (?, ?, ?, 0, 1, 1, ?, ?, ?, ?)`
			)
			.run(id, date, kinds, now, now, now, encryptJson(session.dek, content, aad(id, 1)));
		return toMeta(rowByDate(date)!);
	}

	const locked = row.locked === 1;
	const key = requireKey(session, locked);
	const previous = decryptJson<EntryContent>(key, row.payload, aad(row.id, row.revision));
	if (JSON.stringify(previous) === JSON.stringify(content)) return toMeta(row);

	const startNew =
		opts.forceNewRevision || Date.now() - new Date(row.rev_started_at).getTime() > REVISION_WINDOW_MS;

	transaction(() => {
		if (startNew) {
			getDb()
				.prepare(
					`INSERT INTO entry_revisions (entry_id, revision, created_at, saved_at, locked, payload) VALUES (?, ?, ?, ?, ?, ?)`
				)
				.run(row.id, row.revision, row.rev_started_at, row.updated_at, row.locked, row.payload);
			const rev = row.revision + 1;
			getDb()
				.prepare(
					`UPDATE entries SET kinds = ?, revision = ?, rev_started_at = ?, updated_at = ?, payload = ? WHERE id = ?`
				)
				.run(kinds, rev, now, now, encryptJson(key, content, aad(row.id, rev)), row.id);
		} else {
			getDb()
				.prepare(`UPDATE entries SET kinds = ?, updated_at = ?, payload = ? WHERE id = ?`)
				.run(kinds, now, encryptJson(key, content, aad(row.id, row.revision)), row.id);
		}
	});
	return toMeta(rowByDate(date)!);
}

export function listRevisions(session: Session, date: string): RevisionInfo[] {
	const row = rowByDate(date);
	if (!row) return [];
	const revs = getDb()
		.prepare('SELECT * FROM entry_revisions WHERE entry_id = ? ORDER BY revision DESC')
		.all(row.id) as unknown as RevisionRow[];
	const currentKey = keyFor(session, row.locked === 1);
	const result: RevisionInfo[] = [
		{
			revision: row.revision,
			createdAt: row.updated_at,
			content: currentKey ? decryptJson<EntryContent>(currentKey, row.payload, aad(row.id, row.revision)) : null
		}
	];
	for (const r of revs) {
		const key = keyFor(session, r.locked === 1);
		result.push({
			revision: r.revision,
			createdAt: r.saved_at,
			content: key ? decryptJson<EntryContent>(key, r.payload, aad(row.id, r.revision)) : null
		});
	}
	return result;
}

export function restoreRevision(session: Session, date: string, revision: number): boolean {
	const rev = listRevisions(session, date).find((r) => r.revision === revision);
	if (!rev) return false;
	if (!rev.content) throw new LockedError();
	saveEntry(session, date, rev.content, { forceNewRevision: true });
	return true;
}

/** Sperrt bzw. entsperrt einen Eintrag inkl. aller früheren Versionen. Benötigt die PIN. */
export function setLocked(session: Session, date: string, locked: boolean) {
	const row = rowByDate(date);
	if (!row || (row.locked === 1) === locked) return;
	if (!session.lockKey) throw new LockedError();
	const from = row.locked === 1 ? session.lockKey : session.dek;
	const to = locked ? session.lockKey : session.dek;
	transaction(() => {
		const content = decryptJson<EntryContent>(from, row.payload, aad(row.id, row.revision));
		getDb()
			.prepare('UPDATE entries SET locked = ?, ai_allowed = ?, payload = ? WHERE id = ?')
			.run(locked ? 1 : 0, locked ? 0 : 1, encryptJson(to, content, aad(row.id, row.revision)), row.id);
		const revs = getDb()
			.prepare('SELECT * FROM entry_revisions WHERE entry_id = ?')
			.all(row.id) as unknown as RevisionRow[];
		for (const r of revs) {
			const k = r.locked === 1 ? session.lockKey! : session.dek;
			const c = decryptJson<EntryContent>(k, r.payload, aad(row.id, r.revision));
			getDb()
				.prepare('UPDATE entry_revisions SET locked = ?, payload = ? WHERE entry_id = ? AND revision = ?')
				.run(locked ? 1 : 0, encryptJson(to, c, aad(row.id, r.revision)), row.id, r.revision);
		}
	});
}

export function setAiAllowed(date: string, allowed: boolean) {
	getDb().prepare('UPDATE entries SET ai_allowed = ? WHERE date = ?').run(allowed ? 1 : 0, date);
}

export function isLocked(date: string): boolean {
	return rowByDate(date)?.locked === 1;
}

export function deleteEntry(date: string) {
	getDb().prepare('DELETE FROM entries WHERE date = ?').run(date);
}

/** Verschlüsselt alle gesperrten Datensätze mit einem neuen Sperr-Schlüssel (PIN-Wechsel). */
export function rekeyLocked(oldKey: Buffer, newKey: Buffer) {
	const d = getDb();
	const rows = d.prepare('SELECT * FROM entries WHERE locked = 1').all() as unknown as EntryRow[];
	for (const r of rows) {
		const c = decryptJson<EntryContent>(oldKey, r.payload, aad(r.id, r.revision));
		d.prepare('UPDATE entries SET payload = ? WHERE id = ?').run(encryptJson(newKey, c, aad(r.id, r.revision)), r.id);
	}
	const revs = d.prepare('SELECT * FROM entry_revisions WHERE locked = 1').all() as unknown as RevisionRow[];
	for (const r of revs) {
		const c = decryptJson<EntryContent>(oldKey, r.payload, aad(r.entry_id, r.revision));
		d.prepare('UPDATE entry_revisions SET payload = ? WHERE entry_id = ? AND revision = ?').run(
			encryptJson(newKey, c, aad(r.entry_id, r.revision)),
			r.entry_id,
			r.revision
		);
	}
}

export function countLocked(): number {
	return (getDb().prepare('SELECT COUNT(*) AS n FROM entries WHERE locked = 1').get() as { n: number }).n;
}

/** Einträge eines Zeitraums für die KI-Auswertung. */
export function entriesForAi(
	session: Session,
	from: string,
	to: string
): { entries: Entry[]; skippedLocked: number } {
	const rows = getDb()
		.prepare('SELECT * FROM entries WHERE date >= ? AND date <= ? AND ai_allowed = 1 ORDER BY date ASC')
		.all(from, to) as unknown as EntryRow[];
	const entries: Entry[] = [];
	let skippedLocked = 0;
	for (const r of rows) {
		const key = keyFor(session, r.locked === 1);
		if (!key) {
			skippedLocked++;
			continue;
		}
		entries.push({ ...toMeta(r), content: decryptJson<EntryContent>(key, r.payload, aad(r.id, r.revision)) });
	}
	return { entries, skippedLocked };
}

/** Stimmung pro Tag in einem Zeitraum (für den Verlauf in den Einsichten). Gesperrte Einträge nur mit PIN. */
export function moodSeries(session: Session, from: string, to: string): { date: string; mood: number }[] {
	const rows = getDb()
		.prepare('SELECT * FROM entries WHERE date >= ? AND date <= ? ORDER BY date ASC')
		.all(from, to) as unknown as EntryRow[];
	const out: { date: string; mood: number }[] = [];
	for (const r of rows) {
		const key = keyFor(session, r.locked === 1);
		if (!key) continue;
		const mood = decryptJson<EntryContent>(key, r.payload, aad(r.id, r.revision)).mood;
		if (typeof mood === 'number' && mood >= 1 && mood <= 5) out.push({ date: r.date, mood });
	}
	return out;
}
