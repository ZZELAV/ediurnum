/** So lange bleiben Erfolgsmeldungen sichtbar; Fehler bleiben stehen, bis die nächste Aktion sie ersetzt. */
export const FLASH_MS = 5000;

export type FlashMessage = { kind: 'ok' | 'error'; text: string };

/** Meldung, die nach FLASH_MS von selbst verschwindet (ausser Fehlern). */
export class Flash {
	current = $state<FlashMessage | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(text: string, kind: FlashMessage['kind'] = 'ok') {
		this.current = { kind, text };
		clearTimeout(this.#timer);
		if (kind === 'ok') this.#timer = setTimeout(() => (this.current = null), FLASH_MS);
	}

	clear() {
		clearTimeout(this.#timer);
		this.current = null;
	}
}

/**
 * Für Formular-Ergebnisse (`form`): Das Ergebnis gilt nach FLASH_MS als abgelaufen, ausser `keep` trifft zu
 * (Fehler). Jede Übermittlung liefert ein neues Objekt, deshalb erscheint dieselbe Meldung beim nächsten Mal wieder.
 * Muss beim Initialisieren einer Komponente aufgerufen werden.
 */
export function expiring<T extends object>(get: () => T | null | undefined, keep: (value: T) => boolean = () => false) {
	// raw: ein Proxy wäre nicht mehr identisch mit dem Formular-Ergebnis
	let expired = $state.raw<T | null>(null);
	$effect(() => {
		const value = get();
		if (!value || keep(value)) return;
		const timer = setTimeout(() => (expired = value), FLASH_MS);
		return () => clearTimeout(timer);
	});
	return {
		get current(): T | null {
			const value = get();
			return value && value !== expired ? value : null;
		}
	};
}
