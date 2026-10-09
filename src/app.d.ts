import type { Session } from '$lib/server/vault';
import type { Lang, Settings } from '$lib/types';

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			session: Session | null;
			settings: Settings | null;
			lang: Lang;
		}
		interface Error {
			message: string;
			key?: string;
		}
	}
}

export {};
