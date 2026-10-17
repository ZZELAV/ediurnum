import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { sendToAll } from '#lib/server/reminders.ts';
import { translate } from '#lib/i18n/index.ts';

/** Test notification to all registered devices. */
export const POST: RequestHandler = async (event) => {
	requireSession(event);
	const t = (key: string) => translate(event.locals.lang, key);
	const sent = await sendToAll({ title: t('push.test.title'), body: t('push.test.body'), url: '/reminders#push', tag: 'test' });
	return Response.json({ sent });
};
