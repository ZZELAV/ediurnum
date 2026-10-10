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

/** Fasst benachbarte Teile gleicher Art zusammen; Leerraum zwischen zwei Änderungen zählt zur Änderung. */
function merge(parts: DiffPart[]): DiffPart[] {
	const out: DiffPart[] = [];
	for (let k = 0; k < parts.length; k++) {
		const p = parts[k];
		const prev = out[out.length - 1];
		const next = parts[k + 1];
		const kind =
			p.kind === 'same' && /^\s+$/.test(p.text) && prev && prev.kind !== 'same' && next && next.kind === prev.kind
				? prev.kind
				: p.kind;
		if (prev && prev.kind === kind) prev.text += p.text;
		else out.push({ text: p.text, kind });
	}
	return out;
}

export const hasChanges = (parts: DiffPart[]) => parts.some((p) => p.kind !== 'same');
