import type { EntryContent } from '#lib/types.ts';

/** Kurzer Auszug für Übersichten: Höhepunkt, sonst Erlebtes, sonst freie Seite. */
export function snippetOf(c: EntryContent, max = 140): string {
	const e = c.sections.daily ?? {};
	const candidates = [e.highlight, e.experienced, c.free, ...(Array.isArray(e.gratitude) ? e.gratitude : [])];
	const text = candidates.find((v): v is string => typeof v === 'string' && v.trim().length > 0)?.trim() ?? '';
	const oneLine = text.replace(/\s+/g, ' ');
	return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}
