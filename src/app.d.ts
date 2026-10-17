import type { Session } from '#lib/server/vault.ts';
import type { Lang, Settings, Theme } from '#lib/types.ts';

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			session: Session | null;
			settings: Settings | null;
			lang: Lang;
			/** Format for dates and numbers, e.g. `de-CH` (from Accept-Language, matching `lang`) */
			locale: string;
			/** From the settings, without a session from the cookie (login, recover) */
			theme: Theme;
		}
		interface Error {
			message: string;
			key?: string;
		}
	}
}

export {};
