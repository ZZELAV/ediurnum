import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		lang: locals.lang,
		locale: locals.locale,
		theme: locals.settings?.theme ?? 'system',
		version: __APP_VERSION__,
		authenticated: locals.session !== null
	};
};
