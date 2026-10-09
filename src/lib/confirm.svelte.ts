/**
 * Bestätigung in der App statt `window.confirm()`.
 * Browser-Dialoge werden in eingebetteten Browsern und manchen installierten Web-Apps
 * unterdrückt (gelten dann als „Abbrechen“) – damit liessen sich Dinge nicht mehr löschen.
 * Angezeigt wird die Frage von <ConfirmDialog /> im Wurzel-Layout.
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
