import { SECTIONS } from './templates.ts';
import type { EntryContent } from './types.ts';

/**
 * Full-text search across decrypted entries. Runs only in RAM on the server –
 * there is no search index because it would be stored in plain text on disk.
 * Case and accents don't matter („cafe“ finds „Café“, „strasse“ finds „Straße“).
 */

export interface SearchHit {
	/** Text key of the field the excerpt is from (e.g. `section.daily.highlight`). */
	field: string;
	/** Excerpt as parts; `hit` marks the matches. */
	parts: { text: string; hit: boolean }[];
}

const MAX_TERMS = 8;
const CONTEXT = 70; // characters before and after the first match

export function searchTerms(query: string): string[] {
	return [...new Set(fold(query).split(/\s+/).filter(Boolean))].slice(0, MAX_TERMS);
}

/** Lower case without accents; `map[i]` points to the character in the original text. */
function foldWithMap(text: string): { folded: string; map: number[] } {
	let folded = '';
	const map: number[] = [];
	let i = 0;
	for (const ch of text) {
		const f = fold(ch);
		folded += f;
		for (let k = 0; k < f.length; k++) map.push(i);
		i += ch.length;
	}
	map.push(text.length);
	return { folded, map };
}

function fold(text: string): string {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss');
}

/** All searchable texts of an entry with the text key of their field. */
function fieldsOf(c: EntryContent, t: (key: string) => string): { field: string; text: string }[] {
	const out: { field: string; text: string }[] = [];
	for (const def of SECTIONS) {
		const sec = c.sections[def.kind];
		if (!sec) continue;
		for (const f of def.fields) {
			const v = sec[f.id];
			const field = `section.${def.kind}.${f.id}`;
			if (typeof v === 'string' && v.trim()) out.push({ field, text: v });
			else if (Array.isArray(v)) {
				const vals = v.filter((x) => x.trim());
				if (!vals.length) continue;
				out.push({ field, text: (f.type === 'chips' ? vals.map((x) => t(`emotion.${x}`)) : vals).join(' · ') });
			}
		}
	}
	if (c.free.trim()) out.push({ field: 'entry.free', text: c.free });
	return out;
}

/**
 * Checks whether an entry contains all search terms (in any fields)
 * and returns an excerpt around the first match.
 */
export function matchEntry(c: EntryContent, terms: string[], t: (key: string) => string): SearchHit | null {
	if (!terms.length) return null;
	const fields = fieldsOf(c, t).map((f) => ({ ...f, ...foldWithMap(f.text.replace(/\s+/g, ' ')) }));
	if (!terms.every((term) => fields.some((f) => f.folded.includes(term)))) return null;

	// excerpt from the first field that contains a term
	const f = fields.find((x) => terms.some((term) => x.folded.includes(term)))!;
	const text = f.text.replace(/\s+/g, ' ');
	const ranges: [number, number][] = [];
	for (const term of terms) {
		for (let at = f.folded.indexOf(term); at !== -1; at = f.folded.indexOf(term, at + term.length)) {
			ranges.push([f.map[at], f.map[at + term.length]]);
		}
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const first = ranges[0][0];
	const start = first > CONTEXT ? text.lastIndexOf(' ', first - CONTEXT) + 1 || first - CONTEXT : 0;
	const endWish = ranges[0][1] + CONTEXT;
	const end = endWish < text.length ? text.indexOf(' ', endWish) === -1 ? text.length : text.indexOf(' ', endWish) : text.length;

	const parts: SearchHit['parts'] = [];
	let pos = start;
	for (const [a, b] of ranges) {
		if (b <= pos || a >= end) continue;
		const from = Math.max(a, pos);
		if (from > pos) parts.push({ text: text.slice(pos, from), hit: false });
		parts.push({ text: text.slice(from, Math.min(b, end)), hit: true });
		pos = Math.min(b, end);
	}
	if (pos < end) parts.push({ text: text.slice(pos, end), hit: false });
	if (start > 0) parts.unshift({ text: '… ', hit: false });
	if (end < text.length) parts.push({ text: ' …', hit: false });
	return { field: f.field, parts };
}
