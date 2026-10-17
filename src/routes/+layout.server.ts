import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		lang: locals.lang,
		locale: locals.locale,
		deviceCountry: locals.deviceCountry,
		theme: locals.theme,
		version: __APP_VERSION__,
		authenticated: locals.session !== null
	};
};
