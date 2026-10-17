/**
 * Very small, safe Markdown renderer for AI answers and the changelog.
 * All text is HTML-escaped first; afterwards only a few
 * formats (headings, lists, tables, bold, italic, code, links to http(s)) are created.
 */

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function inline(s: string): string {
	return escapeHtml(s)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
}

// ---- Tables (like GitHub): header row, separator row with --- (optional : for the alignment), rows ----

type Align = 'left' | 'center' | 'right' | null;

/** Cells of a table row; edge pipes are optional, `\|` stands for a pipe in the text. */
function cells(line: string): string[] {
	let s = line.trim();
	if (s.startsWith('|')) s = s.slice(1);
	if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
	return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

const isTableRow = (line: string) => line.includes('|');

/** Separator row such as `|---|:---:|--:|`; returns the alignment per column or null. */
function separator(line: string): Align[] | null {
	if (!line.includes('-') || !/^\s*\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/.test(line)) return null;
	return cells(line).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
}

function table(head: string[], aligns: Align[], rows: string[][]): string {
	const cell = (tag: 'th' | 'td', text: string, i: number) =>
		`<${tag}${aligns[i] ? ` class="align-${aligns[i]}"` : ''}>${inline(text)}</${tag}>`;
	// as many cells as the header row: missing ones empty, surplus ones dropped
	const fit = (row: string[]) => aligns.map((_, i) => row[i] ?? '');
	return [
		'<div class="table-wrap"><table>',
		`<thead><tr>${fit(head).map((c, i) => cell('th', c, i)).join('')}</tr></thead>`,
		`<tbody>${rows.map((r) => `<tr>${fit(r).map((c, i) => cell('td', c, i)).join('')}</tr>`).join('')}</tbody>`,
		'</table></div>'
	].join('');
}

export function renderMarkdown(md: string): string {
	const lines = md.replace(/\r\n/g, '\n').split('\n');
	const out: string[] = [];
	let list: 'ul' | 'ol' | null = null;
	let para: string[] = [];

	const flushPara = () => {
		if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};
	const closeList = () => {
		if (list) out.push(`</${list}>`);
		list = null;
	};

	for (let n = 0; n < lines.length; n++) {
		const line = lines[n].trimEnd();
		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		const ul = line.match(/^\s*[-*•]\s+(.*)$/);
		const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
		// a table only if header and separator row have the same number of columns (otherwise e.g. text above a horizontal rule)
		const head = isTableRow(line) ? cells(line) : null;
		const aligns = head && n + 1 < lines.length ? separator(lines[n + 1]) : null;
		if (head && aligns && aligns.length === head.length) {
			flushPara();
			closeList();
			const rows: string[][] = [];
			for (n += 2; n < lines.length && lines[n].trim() && isTableRow(lines[n]); n++) rows.push(cells(lines[n]));
			n--;
			out.push(table(head, aligns, rows));
		} else if (heading) {
			flushPara();
			closeList();
			const level = Math.min(4, heading[1].length + 1);
			out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
		} else if (ul || ol) {
			flushPara();
			const kind = ul ? 'ul' : 'ol';
			if (list !== kind) {
				closeList();
				out.push(`<${kind}>`);
				list = kind;
			}
			out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
		} else if (!line.trim()) {
			flushPara();
			closeList();
		} else if (/^-{3,}$/.test(line.trim())) {
			flushPara();
			closeList();
			out.push('<hr>');
		} else {
			closeList();
			para.push(line);
		}
	}
	flushPara();
	closeList();
	return out.join('\n');
}
