import { defineEnvVars } from '@sveltejs/kit/env';

/** Empty values count as not set. */
const optional = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

/**
 * Environment variables of the app (read at start, not at build time). Description for operators:
 * docs/DEPLOYMENT.md. Never log values that contain secrets (WIDGET_TOKEN).
 */
export const variables = defineEnvVars({
	DATA_DIR: {
		description: 'Folder for the database (default ./data)',
		schema: (value) => optional(value) ?? './data'
	},
	ORIGIN: {
		description: 'Public address, e.g. https://journal.example.com – for secure cookies and the push sender',
		schema: (value) => optional(value)?.replace(/\/+$/, '')
	},
	COOKIE_SECURE: {
		description: 'true/false: send the session cookie only over HTTPS; default follows ORIGIN (https:// → true)',
		schema: optional
	},
	LOG_LEVEL: {
		description: 'error, warn, info (default) or debug (additionally every request)',
		schema: optional
	},
	VAPID_SUBJECT: {
		description: 'Sender for push services (mailto: or https:), default: ORIGIN',
		schema: optional
	},
	WIDGET_TOKEN: {
		description: 'Bearer token for /api/widget (at least 16 characters), otherwise the endpoint is off',
		schema: optional
	}
});
