import type { Session } from '#lib/server/vault.ts';
import type { Lang, Settings, Theme } from '#lib/types.ts';

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			session: Session | null;
			settings: Settings | null;
			lang: Lang;
			/** Language + country of the device, e.g. `de-CH`: format of dates and numbers, spelling of the texts */
			locale: string;
			/** Country of the device (browser language or time zone), if known – for Settings → Region "automatic" */
			deviceCountry: string | null;
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
