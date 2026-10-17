export const MIN_PASSWORD = 10;
/** Upper limit, so nobody can push huge inputs through Argon2 (even without signing in). */
export const MAX_PASSWORD = 1024;

/** Returns an i18n error key or null. */
export function validateNewPassword(password: string, confirm: string): string | null {
	if (password.length < MIN_PASSWORD) return 'error.passwordTooShort';
	if (password.length > MAX_PASSWORD) return 'error.passwordTooLong';
	if (password !== confirm) return 'error.passwordMismatch';
	return null;
}

export function validatePin(pin: string, confirm?: string): string | null {
	if (!/^\d{4,12}$/.test(pin)) return 'error.pinFormat';
	if (confirm !== undefined && pin !== confirm) return 'error.pinMismatch';
	return null;
}
