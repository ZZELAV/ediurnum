import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { fail } from '$lib/server/api';
import { addDevice, removeAllDevices, removeDevice } from '$lib/server/reminders';
import { log } from '$lib/server/log';

/** Gerät für Push-Benachrichtigungen anmelden. */
export const POST: RequestHandler = async (event) => {
	requireSession(event);
	const { subscription, label } = await event.request.json();
	const endpoint = subscription?.endpoint;
	const keys = subscription?.keys;
	if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
		return fail('common.error');
	}
	addDevice({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, String(label ?? ''));
	log.info('push device registered', { service: new URL(endpoint).hostname });
	return json({ ok: true });
};

/** Gerät abmelden ({ endpoint }) oder alle Geräte ({ all: true }). */
export const DELETE: RequestHandler = async (event) => {
	requireSession(event);
	const body = await event.request.json().catch(() => ({}));
	if (body.all === true) removeAllDevices();
	else if (typeof body.endpoint === 'string') removeDevice(body.endpoint);
	log.info(body.all === true ? 'all push devices removed' : 'push device removed');
	return json({ ok: true });
};
