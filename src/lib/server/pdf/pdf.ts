import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { translate } from '#lib/i18n/index.ts';
import { dateLocale, entryDocs, type EntryField } from '../export.ts';
import type { Entry, Lang } from '#lib/types.ts';

/**
 * Lesbarer Export als PDF – aus derselben Aufbereitung wie das Markdown (`entryDocs`).
 * Schriften: Lora (Text) und Inter (Beschriftungen) wie in der App, als WOFF in `fonts/` (Lizenz: SIL OFL).
 * Je Schnitt zwei Dateien: Latin und Latin Extended. Zeichen, die keine der beiden enthält (z. B. Emojis), fallen weg.
 * Die App lädt die Dateien über `fonts.ts` (in den Server-Build eingebettet), das Skript direkt aus dem Ordner.
 */

export const FONT_FILES = {
	serif: ['lora-latin-400-normal.woff', 'lora-latin-ext-400-normal.woff'],
	serifBold: ['lora-latin-700-normal.woff', 'lora-latin-ext-700-normal.woff'],
	sans: ['inter-latin-400-normal.woff', 'inter-latin-ext-400-normal.woff'],
	sansBold: ['inter-latin-600-normal.woff', 'inter-latin-ext-600-normal.woff']
} as const;

/** Dateiname → Inhalt aller Dateien aus FONT_FILES */
export type PdfFonts = Record<string, Uint8Array>;

type FaceName = keyof typeof FONT_FILES;
interface Face {
	fonts: PDFFont[];
	chars: Set<number>[];
}

// Farben wie im hellen Design (app.css)
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex('#2b2723');
const SOFT = hex('#645b52');
const FAINT = hex('#958b80');
const RULE = hex('#e7e1d5');
const ACCENT = hex('#46624d');
const MOOD = ['#7d5ba6', '#3f7cbf', '#8c8a80', '#4c9a5b', '#d4991c'].map(hex);

// A4 in Punkten, Ränder
const W = 595.28;
const H = 841.89;
const X = 64;
const TOP = 64;
const BOTTOM = 72;
const MAX_W = W - 2 * X;

/** Text in Abschnitte je Schrift (Latin, sonst Latin Extended); Zeichen ohne Glyphe entfallen. */
function runs(face: Face, text: string) {
	const out: { font: PDFFont; text: string }[] = [];
	for (const ch of text) {
		const i = face.chars.findIndex((set) => set.has(ch.codePointAt(0)!));
		if (i === -1) continue;
		const last = out.at(-1);
		if (last?.font === face.fonts[i]) last.text += ch;
		else out.push({ font: face.fonts[i], text: ch });
	}
	return out;
}

const widthOf = (face: Face, text: string, size: number) =>
	runs(face, text).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);

/** Bricht Text auf die Breite um; Absätze bleiben erhalten, überlange Wörter werden geteilt. */
function wrap(face: Face, text: string, size: number, maxWidth: number): string[] {
	const lines: string[] = [];
	const space = widthOf(face, ' ', size);
	for (const para of text.replace(/\r/g, '').replace(/\t/g, ' ').split('\n')) {
		let line = '';
		let lineW = 0;
		for (let word of para.split(' ').filter(Boolean)) {
			let w = widthOf(face, word, size);
			if (line && lineW + space + w <= maxWidth) {
				line += ' ' + word;
				lineW += space + w;
				continue;
			}
			if (line) lines.push(line);
			while (w > maxWidth) {
				let cut = word.length - 1;
				while (cut > 1 && widthOf(face, word.slice(0, cut), size) > maxWidth) cut--;
				lines.push(word.slice(0, cut));
				word = word.slice(cut);
				w = widthOf(face, word, size);
			}
			line = word;
			lineW = w;
		}
		lines.push(line);
	}
	return lines;
}

export async function exportPdf(entries: Entry[], lang: Lang, skippedLocked: number, fontFiles: PdfFonts): Promise<Uint8Array> {
	const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const faces = {} as Record<FaceName, Face>;
	for (const [name, files] of Object.entries(FONT_FILES) as [FaceName, readonly string[]][]) {
		const fonts = await Promise.all(files.map((f) => doc.embedFont(fontFiles[f], { subset: true })));
		faces[name] = { fonts, chars: fonts.map((f) => new Set(f.getCharacterSet())) };
	}

	let page: PDFPage = doc.addPage([W, H]);
	let y = H - TOP;
	const newPage = () => {
		page = doc.addPage([W, H]);
		y = H - TOP;
	};
	/** Neue Seite, wenn weniger als `h` Platz bleibt */
	const ensure = (h: number) => {
		if (y - h < BOTTOM) newPage();
	};
	const draw = (text: string, face: Face, size: number, x: number, baseline: number, color = INK) => {
		for (const r of runs(face, text)) {
			page.drawText(r.text, { x, y: baseline, size, font: r.font, color });
			x += r.font.widthOfTextAtSize(r.text, size);
		}
	};
	/** Umgebrochener Text ab der aktuellen Position; Zeilenhöhe 1.45 × Schriftgrösse */
	const paragraph = (text: string, face: Face, size: number, color = INK, x = X) => {
		const lh = size * 1.45;
		for (const line of wrap(face, text, size, MAX_W - (x - X))) {
			ensure(lh);
			if (line) draw(line, face, size, x, y - size, color);
			y -= lh;
		}
	};
	const rule = () => {
		page.drawLine({ start: { x: X, y }, end: { x: W - X, y }, thickness: 0.6, color: RULE });
	};

	// Kopf
	const docs = entryDocs(entries, lang);
	const today = new Intl.DateTimeFormat(dateLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
	paragraph('ediurnum', faces.sansBold, 10, ACCENT);
	y -= 4;
	paragraph(t('export.title'), faces.serifBold, 26);
	y -= 2;
	paragraph(t('export.subtitle', { date: today, count: docs.length }), faces.sans, 10, SOFT);
	if (skippedLocked) paragraph(t('export.skippedLocked', { count: skippedLocked }), faces.sans, 10, SOFT);

	const field = (f: EntryField) => {
		ensure(13 + 16);
		paragraph(f.label, faces.sans, 8.5, FAINT);
		if (f.kind === 'list') {
			f.values.forEach((v, i) => {
				ensure(16);
				draw(`${i + 1}.`, faces.sans, 9, X, y - 11, FAINT);
				paragraph(v, faces.serif, 11, INK, X + 16);
			});
		} else if (f.kind === 'scale') paragraph(`${f.values[0]}/5`, faces.serif, 11);
		else paragraph(f.values.join(f.kind === 'chips' ? ' · ' : '\n'), faces.serif, 11);
		y -= 6;
	};

	for (const d of docs) {
		// Datum nicht allein unten auf der Seite
		y -= 20;
		ensure(90);
		rule();
		y -= 18;
		paragraph(d.heading, faces.serifBold, 15);
		if (d.mood) {
			ensure(16);
			page.drawCircle({ x: X + 3.5, y: y - 6.5, size: 3.5, color: MOOD[d.mood - 1] });
			draw(`${t('entry.mood')}: ${d.mood}/5 · ${t(`mood.${d.mood}`)}`, faces.sans, 9.5, X + 12, y - 9.5, SOFT);
			y -= 16;
		}
		for (const s of d.sections) {
			y -= 8;
			ensure(15 + 40);
			paragraph(s.title, faces.sansBold, 9.5, ACCENT);
			y -= 2;
			s.fields.forEach(field);
		}
		if (d.free) {
			y -= 8;
			ensure(15 + 40);
			paragraph(t('entry.free'), faces.sansBold, 9.5, ACCENT);
			y -= 2;
			paragraph(d.free, faces.serif, 11);
		}
	}

	// Fusszeile mit Seitenzahlen
	const pages = doc.getPages();
	pages.forEach((p, i) => {
		page = p;
		const text = `ediurnum · ${t('export.page', { page: i + 1, pages: pages.length })}`;
		draw(text, faces.sans, 8, (W - widthOf(faces.sans, text, 8)) / 2, 40, FAINT);
	});

	doc.setTitle(`ediurnum – ${t('export.title')}`);
	doc.setLanguage(dateLocale(lang));
	doc.setCreator('ediurnum');
	doc.setProducer('ediurnum');
	return doc.save();
}
