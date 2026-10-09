/**
 * Sehr kleiner, sicherer Markdown-Renderer für KI-Antworten und das Changelog.
 * Sämtlicher Text wird zuerst HTML-escaped; danach werden nur wenige
 * Formatierungen (Überschriften, Listen, fett, kursiv, Code, Links zu http(s)) erzeugt.
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

	for (const raw of lines) {
		const line = raw.trimEnd();
		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		const ul = line.match(/^\s*[-*•]\s+(.*)$/);
		const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
		if (heading) {
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
