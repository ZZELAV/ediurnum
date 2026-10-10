/**
 * Wortweiser Vergleich zweier Texte für die Versionsübersicht. Läuft nur im Browser auf den
 * ohnehin entschlüsselten Versionen. Leerraum bleibt erhalten, damit Zeilenumbrüche stimmen.
 */

export type DiffPart = { text: string; kind: 'same' | 'add' | 'del' };

// Grenze für den Vergleich (Wörter × Wörter); darüber gilt der ganze Text als ersetzt
const MAX_CELLS = 4_000_000;

const tokens = (s: string) => s.split(/(\s+)/).filter((x) => x.length > 0);

export function diffWords(before: string, after: string): DiffPart[] {
	if (before === after) return before ? [{ text: before, kind: 'same' }] : [];
	const a = tokens(before);
	const b = tokens(after);
	if (a.length * b.length > MAX_CELLS) {
		return merge([
			{ text: before, kind: 'del' },
			{ text: after, kind: 'add' }
		]);
	}

	// Längste gemeinsame Teilfolge (LCS), von hinten aufgebaut
	const n = a.length;
	const m = b.length;
	const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const parts: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			parts.push({ text: a[i++], kind: 'same' });
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			parts.push({ text: a[i++], kind: 'del' });
		} else {
			parts.push({ text: b[j++], kind: 'add' });
		}
	}
	while (i < n) parts.push({ text: a[i++], kind: 'del' });
	while (j < m) parts.push({ text: b[j++], kind: 'add' });
	return merge(parts);
}

const isSpace = (p: DiffPart) => p.kind === 'same' && /^\s+$/.test(p.text);

/** Gemeinsamer Leerraum zweier Texte am Anfang bzw. Ende (`pick` liefert den Leerraum eines Textes). */
function commonSpace(a: string, b: string, pick: (s: string) => string): string {
	const x = pick(a);
	const y = pick(b);
	return x === y ? x : '';
}

/**
 * Fasst Änderungen zu Blöcken zusammen: Eine Folge von Streichungen und Ergänzungen, nur durch
 * Leerraum getrennt, wird zu „alles Gestrichene“ gefolgt von „alles Neue“ (statt Wort für Wort
 * abwechselnd). Der Leerraum dazwischen gehört zu beiden Blöcken, damit sich Vorher- und
 * Nachher-Text exakt zurückgewinnen lassen.
 */
function merge(parts: DiffPart[]): DiffPart[] {
	const out: DiffPart[] = [];
	const push = (text: string, kind: DiffPart['kind']) => {
		if (!text) return;
		const prev = out[out.length - 1];
		if (prev && prev.kind === kind) prev.text += text;
		else out.push({ text, kind });
	};
	let k = 0;
	while (k < parts.length) {
		if (parts[k].kind === 'same') {
			push(parts[k++].text, 'same');
			continue;
		}
		// Ende des Änderungsblocks: letzte Änderung, auf die nur noch Leerraum + weitere Änderungen folgen
		let end = k;
		for (let j = k + 1; j < parts.length; j++) {
			if (parts[j].kind !== 'same') end = j;
			else if (!isSpace(parts[j])) break;
		}
		let del = '';
		let add = '';
		for (let j = k; j <= end; j++) {
			const p = parts[j];
			if (p.kind !== 'add') del += p.text;
			if (p.kind !== 'del') add += p.text;
		}
		const block = parts.slice(k, end + 1);
		if (block.some((p) => p.kind === 'del') && block.some((p) => p.kind === 'add')) {
			// Leerraum, der in beiden Fassungen gleich am Rand steht, bleibt unverändert
			const lead = commonSpace(del, add, (s) => s.match(/^\s*/)![0]);
			const trail = commonSpace(del.slice(lead.length), add.slice(lead.length), (s) => s.match(/\s*$/)![0]);
			push(lead, 'same');
			push(del.slice(lead.length, del.length - trail.length), 'del');
			push(add.slice(lead.length, add.length - trail.length), 'add');
			push(trail, 'same');
		} else {
			// Nur Ergänzungen oder nur Streichungen: Teile einzeln übernehmen (Leerraum bleibt unverändert)
			for (const p of block) push(p.text, p.kind);
		}
		k = end + 1;
	}
	return out;
}

export const hasChanges = (parts: DiffPart[]) => parts.some((p) => p.kind !== 'same');
