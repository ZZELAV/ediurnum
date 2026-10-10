import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLocale } from '../src/lib/i18n/locale.ts';

test('Format aus Accept-Language, passend zur App-Sprache', () => {
	assert.equal(pickLocale('de-DE,de;q=0.9,en;q=0.8', 'de'), 'de-DE');
	assert.equal(pickLocale('de-CH', 'de'), 'de-CH');
	assert.equal(pickLocale('en-US,en;q=0.9', 'en'), 'en-US');
	// erste passende Angabe zählt, andere Sprachen werden übersprungen
	assert.equal(pickLocale('fr-CH,de-AT;q=0.8', 'de'), 'de-AT');
	assert.equal(pickLocale('de-CH,de;q=0.9,en-US;q=0.8', 'en'), 'en-US');
});

test('Ohne passende Angabe mit Region gilt das Standard-Format', () => {
	assert.equal(pickLocale(null, 'de'), 'de-CH');
	assert.equal(pickLocale('', 'en'), 'en-GB');
	assert.equal(pickLocale('de', 'de'), 'de-CH');
	assert.equal(pickLocale('fr-FR,it-IT', 'de'), 'de-CH');
	assert.equal(pickLocale('de-DE', 'en'), 'en-GB');
	assert.equal(pickLocale('de-<script>', 'de'), 'de-CH');
});

test('Gross-/Kleinschreibung wird vereinheitlicht', () => {
	assert.equal(pickLocale('de-de', 'de'), 'de-DE');
});
