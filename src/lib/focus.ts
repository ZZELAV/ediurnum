/**
 * Fokusmodus beim Schreiben: Nach drei Zeichen hintereinander blenden
 * Navigation und Seitenspalte langsam aus (Gestaltung in app.css unter "Fokusmodus",
 * gesteuert über data-focus am <html>). Beendet wird er bewusst nur mit Esc –
 * auf Touch-Geräten ohne Tastatur zusätzlich über den Knopf "Fokus beenden".
 */
const START_AFTER_CHARS = 3; // so viele Zeichen hintereinander, bis der Fokus beginnt
const PAUSE_RESETS_MS = 2000; // längere Pause beginnt die Zählung neu
const INTRO_KEY = 'ediurnum.focusIntroSeen'; // Erklärung beim allerersten Fokus (pro Browser)
const INTRO_MS = 7000;

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
	let introTimer: ReturnType<typeof setTimeout> | undefined;

	/** Beim ersten Fokus einmalig erklären, was passiert ist und wie man zurückkommt. */
	function showIntroOnce() {
		try {
			if (localStorage.getItem(INTRO_KEY)) return;
			localStorage.setItem(INTRO_KEY, '1');
		} catch {
			return; // ohne Speicher lieber gar nicht als bei jedem Fokus
		}
		root.dataset.focusIntro = 'on';
		introTimer = setTimeout(hideIntro, INTRO_MS);
	}

	function hideIntro() {
		clearTimeout(introTimer);
		delete root.dataset.focusIntro;
	}

	function onInput() {
		if (!allowed || active) return;
		const now = Date.now();
		streak = now - lastInput > PAUSE_RESETS_MS ? 1 : streak + 1;
		lastInput = now;
		if (streak >= START_AFTER_CHARS) {
			active = true;
			root.dataset.focus = 'on';
			showIntroOnce();
		}
	}

	function exit() {
		streak = lastInput = 0;
		hideIntro();
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
