import type { EntryContent, SectionKind } from './types.ts';

type FieldType = 'text' | 'textarea' | 'lines' | 'scale' | 'chips';

interface FieldDef {
	id: string;
	type: FieldType;
	/** Number of lines for "lines" */
	count?: number;
	/** Options for "chips" */
	options?: string[];
}

interface SectionDef {
	kind: SectionKind;
	/** Suggested rhythm (not binding). */
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
 * The guided questions. Texts are in the language files under
 * `section.<kind>.<fieldId>` (label) and `section.<kind>.<fieldId>.hint` (placeholder).
 * New fields may be added; never rename existing IDs,
 * otherwise old answers are no longer shown.
 */
export const SECTIONS: SectionDef[] = [
	{
		kind: 'daily',
		rhythm: 'daily',
		fields: [
			{ id: 'gratitude', type: 'lines', count: 3 },
			{ id: 'experienced', type: 'textarea' },
			{ id: 'highlight', type: 'text' },
			{ id: 'takeaway', type: 'textarea' }
		]
	},
	{
		kind: 'feelings',
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
		kind: 'growth',
		rhythm: 'monthly',
		fields: [
			{ id: 'learned', type: 'textarea' },
			{ id: 'proud', type: 'textarea' },
			{ id: 'growth', type: 'textarea' },
			{ id: 'nextFocus', type: 'textarea' }
		]
	}
];

/**
 * Section kinds up to 1.0.0 had German names. They still occur in encrypted entries and revisions (converted when
 * read and rewritten on the next save), in backups up to format version 2 and in databases before schema 4.
 */
export const LEGACY_KINDS: Record<string, SectionKind> = { erlebt: 'daily', gefuehl: 'feelings', wachstum: 'growth' };

/** Current name of a section kind; unknown names are returned unchanged. */
export const upgradeKind = (kind: string): string => (Object.hasOwn(LEGACY_KINDS, kind) ? LEGACY_KINDS[kind] : kind);

/**
 * Renames legacy section keys and keeps their order (saving compares the JSON of old and new content).
 * A key with the current name wins over its legacy twin.
 */
export function upgradeSections<T>(sections: Record<string, T>): Record<string, T> {
	if (!Object.keys(sections).some((k) => Object.hasOwn(LEGACY_KINDS, k))) return sections;
	const out: Record<string, T> = {};
	for (const [k, v] of Object.entries(sections)) {
		if (!Object.hasOwn(LEGACY_KINDS, k)) out[k] = v;
		else if (!Object.hasOwn(sections, LEGACY_KINDS[k])) out[LEGACY_KINDS[k]] = v;
	}
	return out;
}

/** Entry content with current section names (see LEGACY_KINDS). */
export function upgradeContent(content: EntryContent): EntryContent {
	const sections = content.sections && typeof content.sections === 'object' ? content.sections : {};
	const upgraded = upgradeSections(sections);
	return upgraded === sections ? content : { ...content, sections: upgraded };
}

export function sectionDef(kind: SectionKind): SectionDef {
	return SECTIONS.find((s) => s.kind === kind)!;
}

export function emptyContent(): EntryContent {
	return { mood: null, sections: { daily: {} }, free: '' };
}

function hasValue(v: unknown): boolean {
	if (v === null || v === undefined) return false;
	if (typeof v === 'string') return v.trim().length > 0;
	if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.trim().length > 0);
	return true;
}

/** Which sections actually contain something? */
export function filledKinds(content: EntryContent): SectionKind[] {
	return SECTIONS.map((s) => s.kind).filter((kind) => {
		const sec = content.sections[kind];
		return sec ? Object.values(sec).some(hasValue) : false;
	});
}

export function isEmptyContent(content: EntryContent): boolean {
	return content.mood === null && !content.free.trim() && filledKinds(content).length === 0;
}

/** Sanitizes input from the browser so only known fields are stored. */
export function sanitizeContent(input: unknown): EntryContent {
	const raw = (input ?? {}) as Partial<EntryContent>;
	const out = emptyContent();
	out.sections = {};
	const mood = Number(raw.mood);
	out.mood = Number.isInteger(mood) && mood >= 1 && mood <= 5 ? mood : null;
	out.free = typeof raw.free === 'string' ? raw.free.slice(0, 100_000) : '';
	// a page loaded before the update may still send legacy section names
	const sections = raw.sections && typeof raw.sections === 'object' ? upgradeSections(raw.sections as Record<string, unknown>) : {};
	for (const def of SECTIONS) {
		const src = sections[def.kind];
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
	if (!out.sections.daily) out.sections.daily = {};
	return out;
}
