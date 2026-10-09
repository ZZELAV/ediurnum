import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { sendToAll } from '$lib/server/reminders';
import { translate } from '$lib/i18n';

/** Testbenachrichtigung an alle angemeldeten Geräte. */
export const POST: RequestHandler = async (event) => {
	requireSession(event);
	const t = (key: string) => translate(event.locals.lang, key);
	const sent = await sendToAll({ title: t('push.test.title'), body: t('push.test.body'), url: '/reminders#push', tag: 'test' });
	return json({ sent });
};
