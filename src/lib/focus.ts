/**
 * Focus mode while writing: after three characters in a row the navigation and the
 * side column slowly fade out (styles in app.css under "Focus mode",
 * controlled via data-focus on <html>). It deliberately ends only with Esc –
 * on touch devices without a keyboard also with the button "Fokus beenden".
 */
const START_AFTER_CHARS = 3; // this many characters in a row until focus starts
const PAUSE_RESETS_MS = 2000; // a longer pause starts counting again

let exitCurrent: (() => void) | null = null;

/** Ends focus mode (button on touch devices, end of editing). */
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
