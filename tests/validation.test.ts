import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PASSWORD, MIN_PASSWORD, validateNewPassword, validatePin } from '../src/lib/server/validation.ts';

test('new password: at least 10, at most 1024 characters, both inputs equal', () => {
	assert.equal(MIN_PASSWORD, 10);
	assert.equal(MAX_PASSWORD, 1024);
	assert.equal(validateNewPassword('123456789', '123456789'), 'error.passwordTooShort');
	assert.equal(validateNewPassword('1234567890', '1234567890'), null);
	assert.equal(validateNewPassword('x'.repeat(1024), 'x'.repeat(1024)), null);
	assert.equal(validateNewPassword('x'.repeat(1025), 'x'.repeat(1025)), 'error.passwordTooLong');
	assert.equal(validateNewPassword('1234567890', '1234567891'), 'error.passwordMismatch');
	assert.equal(validateNewPassword('', ''), 'error.passwordTooShort');
});

test('PIN: 4 to 12 digits, repetition optional', () => {
	assert.equal(validatePin('1234'), null);
	assert.equal(validatePin('123456789012'), null);
	assert.equal(validatePin('123'), 'error.pinFormat');
	assert.equal(validatePin('1234567890123'), 'error.pinFormat');
	assert.equal(validatePin('12a4'), 'error.pinFormat');
	assert.equal(validatePin(' 1234'), 'error.pinFormat');
	assert.equal(validatePin('١٢٣٤'), 'error.pinFormat', 'western digits only');
	assert.equal(validatePin('1234', '1234'), null);
	assert.equal(validatePin('1234', '4321'), 'error.pinMismatch');
});
