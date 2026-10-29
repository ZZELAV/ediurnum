import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { translate } from '#lib/i18n/index.ts';
import { entryDocs, type EntryField } from '../export.ts';
import type { Entry } from '#lib/types.ts';

/**
 * Readable export as PDF – from the same prepared documents as the Markdown (`entryDocs`).
 * Fonts: Lora (text) and Inter (labels) as in the app, as WOFF in `fonts/` (license: SIL OFL).
 * Two files per style: Latin and Latin Extended. Characters that neither contains (e.g. emojis) are dropped.
 * The app loads the files through `fonts.ts` (embedded in the server build), the script directly from the folder.
 */

export const FONT_FILES = {
	serif: ['lora-latin-400-normal.woff', 'lora-latin-ext-400-normal.woff'],
	serifBold: ['lora-latin-700-normal.woff', 'lora-latin-ext-700-normal.woff'],
	sans: ['inter-latin-400-normal.woff', 'inter-latin-ext-400-normal.woff'],
	sansBold: ['inter-latin-600-normal.woff', 'inter-latin-ext-600-normal.woff']
} as const;

/** File name → content of all files from FONT_FILES */
export type PdfFonts = Record<string, Uint8Array>;

type FaceName = keyof typeof FONT_FILES;
interface Face {
	fonts: PDFFont[];
	chars: Set<number>[];
	/** Text → width at size 1 (measuring through fontkit is slow, words repeat) */
	widths: Map<string, number>;
}

// colours as in the light theme (app.css)
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex('#2b2723');
const SOFT = hex('#645b52');
const FAINT = hex('#958b80');
const RULE = hex('#e7e1d5');
const ACCENT = hex('#46624d');
const MOOD = ['#7d5ba6', '#3f7cbf', '#8c8a80', '#4c9a5b', '#d4991c'].map(hex);

// A4 in points, margins
const W = 595.28;
const H = 841.89;
const X = 64;
const TOP = 64;
const BOTTOM = 72;
const MAX_W = W - 2 * X;
/** Entries laid out between two pauses for other requests */
const YIELD_EVERY = 10;

/** Splits text into runs per font (Latin, otherwise Latin Extended); characters without a glyph are dropped. */
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

/** Width of the text; grows linearly with the size, so it is measured once at size 1 */
function widthOf(face: Face, text: string, size: number) {
	let w = face.widths.get(text);
	if (w === undefined) {
		w = runs(face, text).reduce((sum, r) => sum + r.font.widthOfTextAtSize(r.text, 1), 0);
		face.widths.set(text, w);
	}
	return w * size;
}

/** Longest start of the word (at least one character) that fits the width – binary search instead of character by character */
function fittingLength(face: Face, word: string, size: number, maxWidth: number) {
	let lo = 1;
	let hi = word.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (widthOf(face, word.slice(0, mid), size) <= maxWidth) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** Wraps text to the width; paragraphs are kept, overlong words are split. */
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
				const cut = fittingLength(face, word, size, maxWidth);
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

export async function exportPdf(entries: Entry[], loc: string, skippedLocked: number, fontFiles: PdfFonts): Promise<Uint8Array> {
	const t = (key: string, params?: Record<string, string | number>) => translate(loc, key, params);
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const faces = {} as Record<FaceName, Face>;
	for (const [name, files] of Object.entries(FONT_FILES) as [FaceName, readonly string[]][]) {
		const fonts = await Promise.all(files.map((f) => doc.embedFont(fontFiles[f], { subset: true })));
		faces[name] = { fonts, chars: fonts.map((f) => new Set(f.getCharacterSet())), widths: new Map() };
	}

	let page: PDFPage = doc.addPage([W, H]);
	let y = H - TOP;
	const newPage = () => {
		page = doc.addPage([W, H]);
		y = H - TOP;
	};
	/** New page if less than `h` space is left */
	const ensure = (h: number) => {
		if (y - h < BOTTOM) newPage();
	};
	const draw = (text: string, face: Face, size: number, x: number, baseline: number, color = INK) => {
		const parts = runs(face, text);
		parts.forEach((r, i) => {
			page.drawText(r.text, { x, y: baseline, size, font: r.font, color });
			// measuring is slow – the last run needs no width
			if (i < parts.length - 1) x += r.font.widthOfTextAtSize(r.text, size);
		});
	};
	/** Wrapped text from the current position; line height 1.45 × font size */
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

	// header
	const docs = entryDocs(entries, loc);
	const today = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
	paragraph('ediurnum', faces.sansBold, 10, ACCENT);
	y -= 4;
	paragraph(t('export.title'), faces.serifBold, 26);
	y -= 2;
	paragraph(t('export.subtitle', { date: today, count: docs.length }), faces.sans, 10, SOFT);
	if (skippedLocked) paragraph(t('export.skippedLocked', { count: skippedLocked }), faces.sans, 10, SOFT);

	/** Mood and energy: coloured dot and one line */
	const scaleLine = (label: string, value: number, word: string) => {
		ensure(16);
		page.drawCircle({ x: X + 3.5, y: y - 6.5, size: 3.5, color: MOOD[value - 1] });
		draw(`${label}: ${value}/5 · ${word}`, faces.sans, 9.5, X + 12, y - 9.5, SOFT);
		y -= 16;
	};

	const field = (f: EntryField) => {
		if (f.kind === 'scale') {
			scaleLine(f.label, Number(f.values[0]), f.values[1]);
			y -= 6;
			return;
		}
		ensure(13 + 16);
		paragraph(f.label, faces.sans, 8.5, FAINT);
		if (f.kind === 'list') {
			f.values.forEach((v, i) => {
				ensure(16);
				draw(`${i + 1}.`, faces.sans, 9, X, y - 11, FAINT);
				paragraph(v, faces.serif, 11, INK, X + 16);
			});
		} else paragraph(f.values.join(f.kind === 'chips' ? ' · ' : '\n'), faces.serif, 11);
		y -= 6;
	};

	for (const [i, d] of docs.entries()) {
		// let other requests through now and then (the server runs on one thread; `save` below does the same)
		if (i % YIELD_EVERY === YIELD_EVERY - 1) await new Promise((resolve) => setImmediate(resolve));
		// don't leave a date alone at the bottom of a page
		y -= 20;
		ensure(90);
		rule();
		y -= 18;
		paragraph(d.heading, faces.serifBold, 15);
		if (d.mood) scaleLine(t('entry.mood'), d.mood, t(`mood.${d.mood}`));
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

	// footer with page numbers
	const pages = doc.getPages();
	pages.forEach((p, i) => {
		page = p;
		const text = `ediurnum · ${t('export.page', { page: i + 1, pages: pages.length })}`;
		draw(text, faces.sans, 8, (W - widthOf(faces.sans, text, 8)) / 2, 40, FAINT);
	});

	doc.setTitle(`ediurnum – ${t('export.title')}`);
	doc.setLanguage(loc);
	doc.setCreator('ediurnum');
	doc.setProducer('ediurnum');
	return doc.save();
}
