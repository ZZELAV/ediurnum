import type { SectionKind } from './types.ts';

/**
 * "Not today" for suggested reviews – remembered per day in the browser.
 * Applies to the entry and the start page alike.
 */
const PREFIX = 'ediurnum:suggest-later:';
const key = (date: string, kind: SectionKind) => `${PREFIX}${date}:${kind}`;

export function isDismissed(date: string, kind: SectionKind): boolean {
	try {
		return localStorage.getItem(key(date, kind)) !== null;
	} catch {
		return false;
	}
}

export function dismiss(date: string, kind: SectionKind) {
	try {
		// marks of other days are no longer needed (including those with the section names before 1.1.0)
		for (const k of Object.keys(localStorage)) {
			if (k.startsWith(PREFIX) && !k.startsWith(`${PREFIX}${date}:`)) localStorage.removeItem(k);
		}
		localStorage.setItem(key(date, kind), '1');
	} catch {
		// storage not available – hidden only until the page is reloaded
	}
}
