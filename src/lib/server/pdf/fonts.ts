import type { PdfFonts } from './pdf.ts';
import loraLatin400 from './fonts/lora-latin-400-normal.woff?inline';
import loraExt400 from './fonts/lora-latin-ext-400-normal.woff?inline';
import loraLatin700 from './fonts/lora-latin-700-normal.woff?inline';
import loraExt700 from './fonts/lora-latin-ext-700-normal.woff?inline';
import interLatin400 from './fonts/inter-latin-400-normal.woff?inline';
import interExt400 from './fonts/inter-latin-ext-400-normal.woff?inline';
import interLatin600 from './fonts/inter-latin-600-normal.woff?inline';
import interExt600 from './fonts/inter-latin-ext-600-normal.woff?inline';

/**
 * Schriften für das PDF in der App: Vite bettet sie per `?inline` als data-URL in den Server-Build ein,
 * so braucht der Server zur Laufzeit keinen Dateipfad. (Das Konverter-Skript liest sie direkt aus `fonts/`.)
 */
const inline: Record<string, string> = {
	'lora-latin-400-normal.woff': loraLatin400,
	'lora-latin-ext-400-normal.woff': loraExt400,
	'lora-latin-700-normal.woff': loraLatin700,
	'lora-latin-ext-700-normal.woff': loraExt700,
	'inter-latin-400-normal.woff': interLatin400,
	'inter-latin-ext-400-normal.woff': interExt400,
	'inter-latin-600-normal.woff': interLatin600,
	'inter-latin-ext-600-normal.woff': interExt600
};

export const pdfFonts: PdfFonts = Object.fromEntries(
	Object.entries(inline).map(([name, url]) => [name, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')])
);
