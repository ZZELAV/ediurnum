import type { SectionKind } from './types.ts';

/**
 * „Heute nicht“ (not today) for suggested reviews – remembered per day in the browser.
 * Applies to the entry and the start page alike.
 */
const key = (date: string, kind: SectionKind) => `ediurnum:suggest-later:${date}:${kind}`;

export function isDismissed(date: string, kind: SectionKind): boolean {
	try {
		return localStorage.getItem(key(date, kind)) !== null;
	} catch {
		return false;
	}
}

export function dismiss(date: string, kind: SectionKind) {
	try {
		localStorage.setItem(key(date, kind), '1');
	} catch {
		// storage not available – hidden only until the page is reloaded
	}
}
