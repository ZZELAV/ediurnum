import { defineEnvVars } from '@sveltejs/kit/env';

/** Empty values count as not set. */
const optional = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

/**
 * Environment variables of the app (read at start, not at build time). Description for operators:
 * docs/DEPLOYMENT.md. Never log values that contain secrets (WIDGET_TOKEN).
 */
export const variables = defineEnvVars({
	DATA_DIR: {
		description: 'Ordner für die Datenbank (Standard ./data)',
		schema: (value) => optional(value) ?? './data'
	},
	ORIGIN: {
		description: 'Öffentliche Adresse, z. B. https://journal.example.com – für sichere Cookies und den Push-Absender',
		schema: (value) => optional(value)?.replace(/\/+$/, '')
	},
	COOKIE_SECURE: {
		description: 'true/false: Sitzungs-Cookie nur über HTTPS senden; Standard folgt ORIGIN (https:// → true)',
		schema: optional
	},
	LOG_LEVEL: {
		description: 'error, warn, info (Standard) oder debug (zusätzlich jede Anfrage)',
		schema: optional
	},
	VAPID_SUBJECT: {
		description: 'Absender für Push-Dienste (mailto: oder https:), Standard: ORIGIN',
		schema: optional
	},
	WIDGET_TOKEN: {
		description: 'Bearer-Token für /api/widget (mindestens 16 Zeichen), sonst ist der Endpunkt aus',
		schema: optional
	}
});
