/** How long success messages stay visible; errors stay until the next action replaces them. */
const FLASH_MS = 5000;

export type FlashMessage = { kind: 'ok' | 'error'; text: string };

/** Message that disappears by itself after FLASH_MS (except errors). */
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
 * For form results (`form`): the result counts as expired after FLASH_MS unless `keep` applies
 * (errors). Every submission returns a new object, so the same message appears again the next time.
 * Must be called while initialising a component.
 */
export function expiring<T extends object>(get: () => T | null | undefined, keep: (value: T) => boolean = () => false) {
	// raw: a proxy would no longer be identical to the form result
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
