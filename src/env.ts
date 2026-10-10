import { defineEnvVars } from '@sveltejs/kit/env';

/** Leere Angaben gelten als nicht gesetzt. */
const optional = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

/**
 * Umgebungsvariablen der App (gelesen beim Start, nicht beim Build). Beschreibung für Betreiber:
 * docs/DEPLOYMENT.md. Nie Werte loggen, die Geheimnisse enthalten (WIDGET_TOKEN).
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
		description: '"false" erlaubt Sitzungs-Cookies ohne HTTPS (nur im Heimnetz sinnvoll)',
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
