import type { Lang } from '#lib/types.ts';

/**
 * Countries to choose from per language (Settings → Region): all countries for which the format data (ICU/CLDR)
 * has a locale of the language – a test checks that every combination exists.
 */
export const REGIONS: Record<Lang, string[]> = {
	de: ['AT', 'BE', 'CH', 'DE', 'IT', 'LI', 'LU'],
	en: [
		'AE', 'AG', 'AI', 'AS', 'AT', 'AU', 'BB', 'BE', 'BI', 'BM', 'BS', 'BW', 'BZ', 'CA', 'CC', 'CH', 'CK', 'CM', 'CX', 'CY',
		'CZ', 'DE', 'DG', 'DK', 'DM', 'EE', 'ER', 'ES', 'FI', 'FJ', 'FK', 'FM', 'FR', 'GB', 'GD', 'GE', 'GG', 'GH', 'GI', 'GM',
		'GS', 'GU', 'GY', 'HK', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IT', 'JE', 'JM', 'JP', 'KE', 'KI', 'KN', 'KY', 'LC',
		'LR', 'LS', 'LT', 'LV', 'MG', 'MH', 'MO', 'MP', 'MS', 'MT', 'MU', 'MV', 'MW', 'MY', 'NA', 'NF', 'NG', 'NL', 'NO', 'NR',
		'NU', 'NZ', 'PG', 'PH', 'PK', 'PL', 'PN', 'PR', 'PT', 'PW', 'RO', 'RW', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SK',
		'SL', 'SS', 'SX', 'SZ', 'TC', 'TK', 'TO', 'TT', 'TV', 'TZ', 'UA', 'UG', 'UM', 'US', 'VC', 'VG', 'VI', 'VU', 'WS', 'ZA',
		'ZM', 'ZW'
	],
	it: ['CH', 'IT', 'SM', 'VA']
};

/** Region setting: "auto" (country of the device) or a country from REGIONS for the language. */
export const AUTO_REGION = 'auto';

export function isRegion(lang: Lang, v: unknown): v is string {
	return v === AUTO_REGION || (typeof v === 'string' && REGIONS[lang].includes(v));
}

/**
 * Time zones (IANA names, including common old names) of the countries in REGIONS. Phones set the time zone
 * from their location, so it is the most reliable hint at the country of the device.
 */
const COUNTRY_ZONES: Record<string, string> = {
	AE: 'Asia/Dubai',
	AG: 'America/Antigua',
	AI: 'America/Anguilla',
	AS: 'Pacific/Pago_Pago',
	AT: 'Europe/Vienna',
	AU: 'Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Perth Australia/Adelaide Australia/Hobart Australia/Darwin Australia/Canberra Australia/Lord_Howe Australia/Broken_Hill Australia/Lindeman Australia/Eucla',
	BB: 'America/Barbados',
	BE: 'Europe/Brussels',
	BI: 'Africa/Bujumbura',
	BM: 'Atlantic/Bermuda',
	BS: 'America/Nassau',
	BW: 'Africa/Gaborone',
	BZ: 'America/Belize',
	CA: 'America/Toronto America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/St_Johns America/Regina America/Moncton America/Whitehorse America/Yellowknife America/Iqaluit America/Glace_Bay America/Goose_Bay America/Dawson_Creek America/Swift_Current America/Montreal',
	CC: 'Indian/Cocos',
	CH: 'Europe/Zurich',
	CK: 'Pacific/Rarotonga',
	CM: 'Africa/Douala',
	CX: 'Indian/Christmas',
	CY: 'Asia/Nicosia Asia/Famagusta Europe/Nicosia',
	CZ: 'Europe/Prague',
	DE: 'Europe/Berlin Europe/Busingen',
	DK: 'Europe/Copenhagen',
	DM: 'America/Dominica',
	EE: 'Europe/Tallinn',
	ER: 'Africa/Asmara Africa/Asmera',
	ES: 'Europe/Madrid Atlantic/Canary Africa/Ceuta',
	FI: 'Europe/Helsinki',
	FJ: 'Pacific/Fiji',
	FK: 'Atlantic/Stanley',
	FM: 'Pacific/Chuuk Pacific/Pohnpei Pacific/Kosrae',
	FR: 'Europe/Paris',
	GB: 'Europe/London',
	GD: 'America/Grenada',
	GE: 'Asia/Tbilisi',
	GG: 'Europe/Guernsey',
	GH: 'Africa/Accra',
	GI: 'Europe/Gibraltar',
	GM: 'Africa/Banjul',
	GS: 'Atlantic/South_Georgia',
	GU: 'Pacific/Guam',
	GY: 'America/Guyana',
	HK: 'Asia/Hong_Kong',
	HU: 'Europe/Budapest',
	ID: 'Asia/Jakarta Asia/Makassar Asia/Jayapura Asia/Pontianak',
	IE: 'Europe/Dublin',
	IL: 'Asia/Jerusalem Asia/Tel_Aviv',
	IM: 'Europe/Isle_of_Man',
	IN: 'Asia/Kolkata Asia/Calcutta',
	IO: 'Indian/Chagos',
	IT: 'Europe/Rome',
	JE: 'Europe/Jersey',
	JM: 'America/Jamaica',
	JP: 'Asia/Tokyo',
	KE: 'Africa/Nairobi',
	KI: 'Pacific/Tarawa Pacific/Kanton Pacific/Enderbury Pacific/Kiritimati',
	KN: 'America/St_Kitts',
	KY: 'America/Cayman',
	LC: 'America/St_Lucia',
	LI: 'Europe/Vaduz',
	LR: 'Africa/Monrovia',
	LS: 'Africa/Maseru',
	LT: 'Europe/Vilnius',
	LU: 'Europe/Luxembourg',
	LV: 'Europe/Riga',
	MG: 'Indian/Antananarivo',
	MH: 'Pacific/Majuro Pacific/Kwajalein',
	MO: 'Asia/Macau Asia/Macao',
	MP: 'Pacific/Saipan',
	MS: 'America/Montserrat',
	MT: 'Europe/Malta',
	MU: 'Indian/Mauritius',
	MV: 'Indian/Maldives',
	MW: 'Africa/Blantyre',
	MY: 'Asia/Kuala_Lumpur Asia/Kuching',
	NA: 'Africa/Windhoek',
	NF: 'Pacific/Norfolk',
	NG: 'Africa/Lagos',
	NL: 'Europe/Amsterdam',
	NO: 'Europe/Oslo',
	NR: 'Pacific/Nauru',
	NU: 'Pacific/Niue',
	NZ: 'Pacific/Auckland Pacific/Chatham',
	PG: 'Pacific/Port_Moresby Pacific/Bougainville',
	PH: 'Asia/Manila',
	PK: 'Asia/Karachi',
	PL: 'Europe/Warsaw',
	PN: 'Pacific/Pitcairn',
	PR: 'America/Puerto_Rico',
	PT: 'Europe/Lisbon Atlantic/Madeira Atlantic/Azores',
	PW: 'Pacific/Palau',
	RO: 'Europe/Bucharest',
	RW: 'Africa/Kigali',
	SB: 'Pacific/Guadalcanal',
	SC: 'Indian/Mahe',
	SD: 'Africa/Khartoum',
	SE: 'Europe/Stockholm',
	SG: 'Asia/Singapore',
	SH: 'Atlantic/St_Helena',
	SI: 'Europe/Ljubljana',
	SK: 'Europe/Bratislava',
	SL: 'Africa/Freetown',
	SM: 'Europe/San_Marino',
	SS: 'Africa/Juba',
	SX: 'America/Lower_Princes',
	SZ: 'Africa/Mbabane',
	TC: 'America/Grand_Turk',
	TK: 'Pacific/Fakaofo',
	TO: 'Pacific/Tongatapu',
	TT: 'America/Port_of_Spain',
	TV: 'Pacific/Funafuti',
	TZ: 'Africa/Dar_es_Salaam',
	UA: 'Europe/Kyiv Europe/Kiev Europe/Uzhgorod Europe/Zaporozhye',
	UG: 'Africa/Kampala',
	UM: 'Pacific/Midway Pacific/Wake',
	US: 'America/New_York America/Detroit America/Chicago America/Denver America/Phoenix America/Los_Angeles America/Anchorage Pacific/Honolulu America/Boise America/Juneau America/Sitka America/Nome America/Adak America/Menominee America/Indiana/Indianapolis America/Indianapolis America/Kentucky/Louisville America/Louisville America/North_Dakota/Center',
	VA: 'Europe/Vatican',
	VC: 'America/St_Vincent',
	VG: 'America/Tortola',
	VI: 'America/St_Thomas',
	VU: 'Pacific/Efate',
	WS: 'Pacific/Apia',
	ZA: 'Africa/Johannesburg',
	ZM: 'Africa/Lusaka',
	ZW: 'Africa/Harare'
};

const ZONES = new Map(Object.entries(COUNTRY_ZONES).flatMap(([country, zones]) => zones.split(' ').map((zone) => [zone, country])));

/** Country of a device time zone (e.g. Europe/Zurich → CH), or null. */
export function countryOfTimeZone(timeZone: string | null | undefined): string | null {
	return (timeZone && ZONES.get(timeZone)) || null;
}
