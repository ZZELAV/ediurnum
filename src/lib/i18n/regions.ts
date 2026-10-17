import type { Lang } from '#lib/types.ts';

/**
 * Country of a device time zone (IANA name → ISO 3166 code). Used when the browser doesn't tell the country
 * for the language of the app (e.g. browser in English, app in German, device in Switzerland).
 * Only the time zones of the countries where one of the app languages is common; others give no country.
 */
const ZONES: Record<string, string> = {
	// German, Italian and their neighbours
	'Europe/Zurich': 'CH',
	'Europe/Berlin': 'DE',
	'Europe/Busingen': 'DE',
	'Europe/Vienna': 'AT',
	'Europe/Vaduz': 'LI',
	'Europe/Luxembourg': 'LU',
	'Europe/Brussels': 'BE',
	'Europe/Rome': 'IT',
	'Europe/San_Marino': 'SM',
	'Europe/Vatican': 'VA',
	'Europe/Malta': 'MT',
	'Europe/Paris': 'FR',
	'Europe/Monaco': 'MC',
	'Europe/Amsterdam': 'NL',
	'Europe/Copenhagen': 'DK',
	'Europe/Stockholm': 'SE',
	'Europe/Oslo': 'NO',
	'Europe/Helsinki': 'FI',
	'Europe/Warsaw': 'PL',
	'Europe/Prague': 'CZ',
	'Europe/Bratislava': 'SK',
	'Europe/Budapest': 'HU',
	'Europe/Ljubljana': 'SI',
	'Europe/Zagreb': 'HR',
	'Europe/Madrid': 'ES',
	'Europe/Lisbon': 'PT',
	'Europe/Athens': 'GR',
	// English
	'Europe/London': 'GB',
	'Europe/Dublin': 'IE',
	'Europe/Gibraltar': 'GI',
	'America/New_York': 'US',
	'America/Detroit': 'US',
	'America/Chicago': 'US',
	'America/Denver': 'US',
	'America/Phoenix': 'US',
	'America/Los_Angeles': 'US',
	'America/Anchorage': 'US',
	'Pacific/Honolulu': 'US',
	'America/Toronto': 'CA',
	'America/Vancouver': 'CA',
	'America/Edmonton': 'CA',
	'America/Winnipeg': 'CA',
	'America/Halifax': 'CA',
	'America/St_Johns': 'CA',
	'Australia/Sydney': 'AU',
	'Australia/Melbourne': 'AU',
	'Australia/Brisbane': 'AU',
	'Australia/Perth': 'AU',
	'Australia/Adelaide': 'AU',
	'Australia/Hobart': 'AU',
	'Australia/Darwin': 'AU',
	'Pacific/Auckland': 'NZ',
	'Africa/Johannesburg': 'ZA',
	'Asia/Kolkata': 'IN',
	'Asia/Calcutta': 'IN',
	'Asia/Singapore': 'SG',
	'Asia/Hong_Kong': 'HK'
};

export function countryOfTimeZone(timeZone: string | null | undefined): string | null {
	return (timeZone && Object.hasOwn(ZONES, timeZone) && ZONES[timeZone]) || null;
}

/**
 * Countries to choose from per language (Settings → Region). Every combination has its own format data;
 * a test checks that. With "automatic" any country of the device can apply, also one not listed here.
 */
export const REGIONS: Record<Lang, string[]> = {
	de: ['DE', 'AT', 'CH', 'LI', 'LU', 'BE', 'IT'],
	en: ['US', 'GB', 'IE', 'CA', 'AU', 'NZ', 'ZA', 'IN', 'SG', 'HK', 'CH', 'DE', 'AT', 'NL', 'BE', 'DK', 'SE', 'FI', 'MT', 'FR', 'ES', 'IT'],
	it: ['IT', 'CH', 'SM', 'VA']
};

/** Region setting: "auto" (country of the device) or a country from REGIONS for the language. */
export const AUTO_REGION = 'auto';

export function isRegion(lang: Lang, v: unknown): v is string {
	return v === AUTO_REGION || (typeof v === 'string' && REGIONS[lang].includes(v));
}
