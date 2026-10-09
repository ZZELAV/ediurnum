export const MIN_PASSWORD = 10;

/** Gibt einen i18n-Fehlerschlüssel zurück oder null. */
export function validateNewPassword(password: string, confirm: string): string | null {
	if (password.length < MIN_PASSWORD) return 'error.passwordTooShort';
	if (password !== confirm) return 'error.passwordMismatch';
	return null;
}

export function validatePin(pin: string, confirm?: string): string | null {
	if (!/^\d{4,12}$/.test(pin)) return 'error.pinFormat';
	if (confirm !== undefined && pin !== confirm) return 'error.pinMismatch';
	return null;
}
