/**
 * Word-by-word comparison of two texts for the version history. Runs only in the browser on the
 * versions that are decrypted anyway. Whitespace is kept so line breaks stay right.
 */

export type DiffPart = { text: string; kind: 'same' | 'add' | 'del' };

// limit for the comparison (words × words); above it the whole text counts as replaced
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

	// longest common subsequence (LCS), built from the end
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

/** Common whitespace of two texts at the start or end (`pick` returns the whitespace of a text). */
function commonSpace(a: string, b: string, pick: (s: string) => string): string {
	const x = pick(a);
	const y = pick(b);
	return x === y ? x : '';
}

/**
 * Groups changes into blocks: a run of removals and additions, separated only by
 * whitespace, becomes "everything removed" followed by "everything new" (instead of alternating
 * word by word). The whitespace in between belongs to both blocks, so the before and
 * after texts can be recovered exactly.
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
		// end of the change block: the last change that is only followed by whitespace + further changes
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
			// whitespace that is the same at the edge in both versions stays unchanged
			const lead = commonSpace(del, add, (s) => s.match(/^\s*/)![0]);
			const trail = commonSpace(del.slice(lead.length), add.slice(lead.length), (s) => s.match(/\s*$/)![0]);
			push(lead, 'same');
			push(del.slice(lead.length, del.length - trail.length), 'del');
			push(add.slice(lead.length, add.length - trail.length), 'add');
			push(trail, 'same');
		} else {
			// only additions or only removals: take the parts one by one (whitespace stays unchanged)
			for (const p of block) push(p.text, p.kind);
		}
		k = end + 1;
	}
	return out;
}

export const hasChanges = (parts: DiffPart[]) => parts.some((p) => p.kind !== 'same');
