import type { EntryContent } from '#lib/types.ts';

/** Short excerpt for overviews: highlight, otherwise what was experienced, otherwise the free page. */
export function snippetOf(c: EntryContent, max = 140): string {
	const e = c.sections.daily ?? {};
	const candidates = [e.highlight, e.experienced, c.free, ...(Array.isArray(e.gratitude) ? e.gratitude : [])];
	const text = candidates.find((v): v is string => typeof v === 'string' && v.trim().length > 0)?.trim() ?? '';
	const oneLine = text.replace(/\s+/g, ' ');
	return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}
