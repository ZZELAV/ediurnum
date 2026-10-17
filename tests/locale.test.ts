import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLocale } from '../src/lib/i18n/locale.ts';

test('format from Accept-Language, matching the app language', () => {
	assert.equal(pickLocale('de-DE,de;q=0.9,en;q=0.8', 'de'), 'de-DE');
	assert.equal(pickLocale('de-CH', 'de'), 'de-CH');
	assert.equal(pickLocale('en-US,en;q=0.9', 'en'), 'en-US');
	// the first matching entry counts, other languages are skipped
	assert.equal(pickLocale('fr-CH,de-AT;q=0.8', 'de'), 'de-AT');
	assert.equal(pickLocale('de-CH,de;q=0.9,en-US;q=0.8', 'en'), 'en-US');
});

test('without a matching entry with a region the default format applies', () => {
	assert.equal(pickLocale(null, 'de'), 'de-CH');
	assert.equal(pickLocale('', 'en'), 'en-GB');
	assert.equal(pickLocale('de', 'de'), 'de-CH');
	assert.equal(pickLocale('fr-FR,it-IT', 'de'), 'de-CH');
	assert.equal(pickLocale('de-DE', 'en'), 'en-GB');
	assert.equal(pickLocale('de-<script>', 'de'), 'de-CH');
});

test('case is normalised', () => {
	assert.equal(pickLocale('de-de', 'de'), 'de-DE');
});
