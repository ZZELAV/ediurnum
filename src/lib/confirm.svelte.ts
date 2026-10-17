/**
 * Confirmation inside the app instead of `window.confirm()`.
 * Browser dialogs are suppressed in embedded browsers and some installed web apps
 * (they then count as „cancel“) – things could no longer be deleted.
 * The question is shown by <ConfirmDialog /> in the root layout.
 */
export interface ConfirmRequest {
	message: string;
	confirmLabel?: string;
	danger?: boolean;
}

export const confirmState = $state<{ request: ConfirmRequest | null; resolve: ((ok: boolean) => void) | null }>({
	request: null,
	resolve: null
});

export function ask(message: string, options: Omit<ConfirmRequest, 'message'> = {}): Promise<boolean> {
	confirmState.resolve?.(false);
	return new Promise((resolve) => {
		confirmState.request = { message, ...options };
		confirmState.resolve = resolve;
	});
}

export function answer(ok: boolean) {
	const resolve = confirmState.resolve;
	confirmState.request = null;
	confirmState.resolve = null;
	resolve?.(ok);
}
