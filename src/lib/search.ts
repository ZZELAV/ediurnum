import { SECTIONS } from './templates.ts';
import type { EntryContent } from './types';

/**
 * Volltextsuche über entschlüsselte Einträge. Läuft nur im RAM auf dem Server –
 * es gibt keinen Suchindex, weil der im Klartext auf der Platte läge.
 * Gross-/Kleinschreibung und Akzente spielen keine Rolle („cafe“ findet „Café“, „strasse“ findet „Straße“).
 */

export interface SearchHit {
	/** Textschlüssel des Feldes, in dem der Auszug steht (z. B. `section.erlebt.highlight`). */
	field: string;
	/** Auszug als Abschnitte; `hit` markiert gefundene Stellen. */
	parts: { text: string; hit: boolean }[];
}

const MAX_TERMS = 8;
const CONTEXT = 70; // Zeichen vor und nach der ersten Fundstelle

export function searchTerms(query: string): string[] {
	return [...new Set(fold(query).split(/\s+/).filter(Boolean))].slice(0, MAX_TERMS);
}

/** Kleinbuchstaben ohne Akzente; `map[i]` zeigt auf das Zeichen im Originaltext. */
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

/** Alle durchsuchbaren Texte eines Eintrags mit dem Textschlüssel ihres Feldes. */
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
 * Prüft, ob ein Eintrag alle Suchbegriffe enthält (in beliebigen Feldern),
 * und liefert einen Auszug rund um die erste Fundstelle.
 */
export function matchEntry(c: EntryContent, terms: string[], t: (key: string) => string): SearchHit | null {
	if (!terms.length) return null;
	const fields = fieldsOf(c, t).map((f) => ({ ...f, ...foldWithMap(f.text.replace(/\s+/g, ' ')) }));
	if (!terms.every((term) => fields.some((f) => f.folded.includes(term)))) return null;

	// Auszug aus dem ersten Feld, das einen Begriff enthält
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
