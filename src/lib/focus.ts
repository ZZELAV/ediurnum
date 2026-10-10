/**
 * Fokusmodus beim Schreiben: Nach drei Zeichen hintereinander blenden
 * Navigation und Seitenspalte langsam aus (Gestaltung in app.css unter "Fokusmodus",
 * gesteuert über data-focus am <html>). Beendet wird er bewusst nur mit Esc –
 * auf Touch-Geräten ohne Tastatur zusätzlich über den Knopf "Fokus beenden".
 */
const START_AFTER_CHARS = 3; // so viele Zeichen hintereinander, bis der Fokus beginnt
const PAUSE_RESETS_MS = 2000; // längere Pause beginnt die Zählung neu

let exitCurrent: (() => void) | null = null;

/** Beendet den Fokusmodus (Knopf auf Touch-Geräten, Ende der Bearbeitung). */
export function exitFocus() {
	exitCurrent?.();
}

export function focusMode(node: HTMLElement, enabled: boolean) {
	const root = document.documentElement;
	let allowed = enabled;
	let active = false;
	let streak = 0;
	let lastInput = 0;

	function onInput() {
		if (!allowed || active) return;
		const now = Date.now();
		streak = now - lastInput > PAUSE_RESETS_MS ? 1 : streak + 1;
		lastInput = now;
		if (streak >= START_AFTER_CHARS) {
			active = true;
			root.dataset.focus = 'on';
		}
	}

	function exit() {
		streak = lastInput = 0;
		if (!active) return;
		active = false;
		delete root.dataset.focus;
	}

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') exit();
	};

	node.addEventListener('input', onInput);
	window.addEventListener('keydown', onKey);
	exitCurrent = exit;

	return {
		update(value: boolean) {
			allowed = value;
			if (!value) exit();
		},
		destroy() {
			exit();
			node.removeEventListener('input', onInput);
			window.removeEventListener('keydown', onKey);
			if (exitCurrent === exit) exitCurrent = null;
		}
	};
}
