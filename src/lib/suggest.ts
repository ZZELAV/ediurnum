import type { SectionKind } from './types';

/**
 * „Heute nicht“ bei vorgeschlagenen Rückblicken – pro Tag im Browser gemerkt.
 * Gilt für den Eintrag und die Startseite gleichermassen.
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
		// Speicher nicht verfügbar – nur bis zum Neuladen ausgeblendet
	}
}
