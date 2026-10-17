import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCountry, isLocale, langOf, localeFor, pickLocale, regionOf, resolveLocale } from '../src/lib/i18n/locale.ts';
import { countryOfTimeZone, isRegion, REGIONS } from '../src/lib/i18n/regions.ts';
import type { Lang } from '../src/lib/types.ts';

test('defaults: de-DE, en-US, it-IT', () => {
	assert.equal(pickLocale(null, 'de'), 'de-DE');
	assert.equal(pickLocale('', 'en'), 'en-US');
	assert.equal(pickLocale(null, 'it'), 'it-IT');
	assert.equal(pickLocale('de', 'de'), 'de-DE', 'a language without a country');
	assert.equal(pickLocale('de-<script>', 'de'), 'de-DE');
});

test('country from a browser language matching the app language', () => {
	assert.equal(pickLocale('de-CH', 'de'), 'de-CH');
	assert.equal(pickLocale('de-de', 'de'), 'de-DE', 'case is normalised');
	assert.equal(pickLocale('fr-CH,de-AT;q=0.8', 'de'), 'de-AT', 'the matching entry wins over the first one');
	assert.equal(pickLocale('it-CH,it;q=0.9', 'it'), 'it-CH');
	assert.equal(pickLocale('en-GB,en;q=0.9', 'en'), 'en-GB');
});

test('the country of the device time zone comes first, if the language has a format for it', () => {
	assert.equal(pickLocale('en-US,en;q=0.9', 'de', 'Europe/Zurich'), 'de-CH', 'browser in English, app in German, device in Switzerland');
	assert.equal(pickLocale(null, 'it', 'Europe/Zurich'), 'it-CH');
	assert.equal(pickLocale(null, 'en', 'Europe/Zurich'), 'en-CH');
	assert.equal(pickLocale(null, 'de', 'Europe/Vienna'), 'de-AT');
	assert.equal(pickLocale('de-DE', 'de', 'Europe/Zurich'), 'de-CH', 'Safari on an iPhone in Switzerland reports de-DE');
	assert.equal(pickLocale('de-AT', 'de', 'America/New_York'), 'de-AT', 'no German format for the USA: the browser language');
	assert.equal(pickLocale('en-US', 'en', 'Asia/Tokyo'), 'en-JP');
	assert.equal(pickLocale('en-US', 'en', 'Asia/Calcutta'), 'en-IN', 'old name of a time zone');
});

test('otherwise the country of another browser language, if the language is used there', () => {
	assert.equal(pickLocale('fr-CH,fr;q=0.9', 'de'), 'de-CH');
	assert.equal(pickLocale('fr-FR', 'de'), 'de-DE', 'German in France has no format of its own');
	assert.equal(pickLocale('en-US', 'de'), 'de-DE', 'no German format for the USA');
	assert.equal(pickLocale(null, 'de', 'America/New_York'), 'de-DE');
});

test('detectCountry and localeFor', () => {
	assert.equal(detectCountry('en-US', 'de', 'Europe/Rome'), 'IT');
	assert.equal(detectCountry(null, 'de', 'Mars/Olympus'), null);
	assert.equal(detectCountry(null, 'de', 'toString'), null, 'no lookup on the prototype');
	assert.equal(localeFor('de', 'LI'), 'de-LI');
	assert.equal(localeFor('it', 'SM'), 'it-SM');
	assert.equal(localeFor('de', 'XX'), 'de-DE');
	assert.equal(localeFor('de', null), 'de-DE');
	assert.equal(countryOfTimeZone('Europe/Zurich'), 'CH');
});

test('helpers for locales', () => {
	assert.equal(langOf('de-CH'), 'de');
	assert.equal(langOf('fr-FR'), 'en', 'unknown languages: English');
	assert.equal(regionOf('de-CH'), 'CH');
	assert.equal(regionOf('de'), null);
	assert.ok(isLocale('de-CH') && isLocale('it') && !isLocale('fr-FR') && !isLocale('de-ch') && !isLocale(42));
});

test('every region to choose has its own format data', () => {
	for (const [lang, countries] of Object.entries(REGIONS) as [Lang, string[]][]) {
		assert.deepEqual(countries.filter((c) => localeFor(lang, c) !== `${lang}-${c}`), [], lang);
	}
	assert.ok(isRegion('de', 'auto') && isRegion('de', 'CH') && !isRegion('it', 'DE') && !isRegion('de', 'toString'));
});

test('resolveLocale: a chosen region wins over the device, "auto" uses the device', () => {
	assert.deepEqual(resolveLocale('de', 'AT', 'de-CH'), { locale: 'de-AT', deviceCountry: 'CH' });
	assert.deepEqual(resolveLocale('de', 'auto', 'de-CH'), { locale: 'de-CH', deviceCountry: 'CH' });
	assert.deepEqual(resolveLocale('de', 'auto', 'en-US', 'Europe/Zurich'), { locale: 'de-CH', deviceCountry: 'CH' });
	assert.deepEqual(resolveLocale('it', null, null), { locale: 'it-IT', deviceCountry: null });
});
