import type { EntryContent, SectionKind } from './types';

export type FieldType = 'text' | 'textarea' | 'lines' | 'scale' | 'chips';

export interface FieldDef {
	id: string;
	type: FieldType;
	/** Anzahl Zeilen bei "lines" */
	count?: number;
	/** Auswahl bei "chips" */
	options?: string[];
}

export interface SectionDef {
	kind: SectionKind;
	/** Vorgeschlagener Rhythmus in Tagen (unverbindlich). */
	rhythm: 'daily' | 'weekly' | 'monthly';
	fields: FieldDef[];
}

export const EMOTIONS = [
	'joy',
	'gratitude',
	'calm',
	'confidence',
	'pride',
	'love',
	'curiosity',
	'tired',
	'stressed',
	'anxious',
	'sad',
	'angry',
	'lonely',
	'overwhelmed',
	'bored'
];

/**
 * Die geführten Fragen. Texte stehen in den Sprachdateien unter
 * `section.<kind>.<fieldId>` (Label) und `section.<kind>.<fieldId>.hint` (Platzhalter).
 * Neue Felder dürfen ergänzt werden; bestehende IDs nie umbenennen,
 * sonst werden alte Antworten nicht mehr angezeigt.
 */
export const SECTIONS: SectionDef[] = [
	{
		kind: 'erlebt',
		rhythm: 'daily',
		fields: [
			{ id: 'gratitude', type: 'lines', count: 3 },
			{ id: 'experienced', type: 'textarea' },
			{ id: 'highlight', type: 'text' },
			{ id: 'takeaway', type: 'textarea' }
		]
	},
	{
		kind: 'gefuehl',
		rhythm: 'weekly',
		fields: [
			{ id: 'energy', type: 'scale' },
			{ id: 'emotions', type: 'chips', options: EMOTIONS },
			{ id: 'energizers', type: 'textarea' },
			{ id: 'drainers', type: 'textarea' },
			{ id: 'onMyMind', type: 'textarea' }
		]
	},
	{
		kind: 'wachstum',
		rhythm: 'monthly',
		fields: [
			{ id: 'learned', type: 'textarea' },
			{ id: 'proud', type: 'textarea' },
			{ id: 'growth', type: 'textarea' },
			{ id: 'nextFocus', type: 'textarea' }
		]
	}
];

export function sectionDef(kind: SectionKind): SectionDef {
	return SECTIONS.find((s) => s.kind === kind)!;
}

export function emptyContent(): EntryContent {
	return { mood: null, sections: { erlebt: {} }, free: '' };
}

function hasValue(v: unknown): boolean {
	if (v === null || v === undefined) return false;
	if (typeof v === 'string') return v.trim().length > 0;
	if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.trim().length > 0);
	return true;
}

/** Welche Abschnitte enthalten tatsächlich Inhalte? */
export function filledKinds(content: EntryContent): SectionKind[] {
	return SECTIONS.map((s) => s.kind).filter((kind) => {
		const sec = content.sections[kind];
		return sec ? Object.values(sec).some(hasValue) : false;
	});
}

export function isEmptyContent(content: EntryContent): boolean {
	return content.mood === null && !content.free.trim() && filledKinds(content).length === 0;
}

/** Bereinigt Eingaben aus dem Browser, damit nur bekannte Felder gespeichert werden. */
export function sanitizeContent(input: unknown): EntryContent {
	const raw = (input ?? {}) as Partial<EntryContent>;
	const out = emptyContent();
	out.sections = {};
	const mood = Number(raw.mood);
	out.mood = Number.isInteger(mood) && mood >= 1 && mood <= 5 ? mood : null;
	out.free = typeof raw.free === 'string' ? raw.free.slice(0, 100_000) : '';
	for (const def of SECTIONS) {
		const src = raw.sections?.[def.kind];
		if (!src || typeof src !== 'object') continue;
		const sec: Record<string, string | number | string[] | null> = {};
		for (const f of def.fields) {
			const v = (src as Record<string, unknown>)[f.id];
			if (f.type === 'text' || f.type === 'textarea') {
				sec[f.id] = typeof v === 'string' ? v.slice(0, 50_000) : '';
			} else if (f.type === 'lines') {
				const arr = Array.isArray(v) ? v : [];
				sec[f.id] = Array.from({ length: f.count ?? 3 }, (_, i) =>
					typeof arr[i] === 'string' ? (arr[i] as string).slice(0, 1000) : ''
				);
			} else if (f.type === 'scale') {
				const n = Number(v);
				sec[f.id] = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
			} else if (f.type === 'chips') {
				const arr = Array.isArray(v) ? v : [];
				sec[f.id] = arr.filter((x): x is string => typeof x === 'string' && (f.options ?? []).includes(x));
			}
		}
		out.sections[def.kind] = sec;
	}
	if (!out.sections.erlebt) out.sections.erlebt = {};
	return out;
}
