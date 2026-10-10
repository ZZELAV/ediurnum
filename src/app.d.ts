import type { Session } from '$lib/server/vault';
import type { Lang, Settings } from '$lib/types';

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			session: Session | null;
			settings: Settings | null;
			lang: Lang;
			/** Format für Datum und Zahlen, z. B. `de-CH` (aus Accept-Language, passend zu `lang`) */
			locale: string;
		}
		interface Error {
			message: string;
			key?: string;
		}
	}
}

export {};
