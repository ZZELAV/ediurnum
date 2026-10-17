import { SECTIONS } from '#lib/templates.ts';
import { translate } from '#lib/i18n/index.ts';
import type { Entry, Lang } from '#lib/types.ts';

/**
 * Readable export (plain text!): one prepared document per entry (`entryDocs`), from which Markdown and PDF are made.
 * Used by the app (settings, AI file) and by the converter script – hence no database import.
 */

export interface EntryField {
	label: string;
	/** text: one text · list: lines (e.g. gratitude) · chips: feelings (translated) · scale: value 1–5 */
	kind: 'text' | 'list' | 'chips' | 'scale';
	values: string[];
}

export interface EntryDoc {
	date: string;
	/** Date written out, e.g. "Friday, 16 October 2026" */
	heading: string;
	mood: number | null;
	sections: { title: string; fields: EntryField[] }[];
	free: string;
}

export const dateLocale = (lang: Lang) => (lang === 'de' ? 'de-CH' : 'en-GB');

export function entryDocs(entries: Entry[], lang: Lang): EntryDoc[] {
	const t = (key: string) => translate(lang, key);
	const dateFmt = new Intl.DateTimeFormat(dateLocale(lang), {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const docs: EntryDoc[] = [];
	for (const e of entries) {
		if (!e.content) continue;
		const c = e.content;
		const sections: EntryDoc['sections'] = [];
		for (const def of SECTIONS) {
			const sec = c.sections[def.kind];
			if (!sec) continue;
			const fields: EntryField[] = [];
			for (const f of def.fields) {
				const v = sec[f.id];
				const label = t(`section.${def.kind}.${f.id}`);
				if (typeof v === 'string' && v.trim()) fields.push({ label, kind: 'text', values: [v.trim()] });
				else if (typeof v === 'number') fields.push({ label, kind: 'scale', values: [String(v)] });
				else if (Array.isArray(v)) {
					const vals = v.filter((x) => x.trim()).map((x) => x.trim());
					if (!vals.length) continue;
					if (f.type === 'chips') fields.push({ label, kind: 'chips', values: vals.map((x) => t(`emotion.${x}`)) });
					else fields.push({ label, kind: 'list', values: vals });
				}
			}
			if (fields.length) sections.push({ title: t(`section.${def.kind}.title`), fields });
		}
		docs.push({ date: e.date, heading: dateFmt.format(new Date(e.date + 'T00:00:00Z')), mood: c.mood, sections, free: c.free.trim() });
	}
	return docs;
}

/**
 * Journal text for Markdown: lines starting with "#" would otherwise become headings
 * and mess up the structure of the file (instructions, entries, days).
 */
export const plain = (text: string) => text.trim().replace(/^(\s*)#/gm, '$1\\#');

/** Entries as Markdown (days as `###`) – for the AI file and the readable export. */
export function formatEntries(entries: Entry[], lang: Lang): string {
	const t = (key: string) => translate(lang, key);
	return entryDocs(entries, lang)
		.map((d) => {
			const lines = [`### ${d.heading}`];
			if (d.mood) lines.push(`${t('entry.mood')}: ${d.mood}/5 (${t(`mood.${d.mood}`)})`);
			for (const s of d.sections) {
				lines.push(`**${s.title}**`);
				for (const f of s.fields) {
					const value =
						f.kind === 'scale' ? `${f.values[0]}/5` : (f.kind === 'chips' ? f.values : f.values.map(plain)).join('; ');
					lines.push(`- ${f.label}: ${value}`);
				}
			}
			if (d.free) lines.push(`**${t('entry.free')}**`, plain(d.free));
			return lines.join('\n');
		})
		.join('\n\n');
}

export function exportMarkdown(entries: Entry[], lang: Lang): string {
	return `# ediurnum – ${translate(lang, 'export.title')}\n\n${formatEntries(entries, lang).replace(/^### /gm, '## ')}\n`;
}

export function exportJson(entries: Entry[], skippedLocked: number): string {
	return JSON.stringify({ format: 'ediurnum-plain', exportedAt: new Date().toISOString(), skippedLocked, entries }, null, 2);
}
