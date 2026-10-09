import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { fail } from '$lib/server/api';
import {
	hasPin,
	registerFailure,
	registerSuccess,
	relockSession,
	throttleRemaining,
	unlockPinForSession,
	verifyPin
} from '$lib/server/vault';

/** PIN eingeben: gesperrte Einträge werden in dieser Sitzung für 10 Minuten lesbar. */
export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	if (!hasPin()) return fail('error.noPin');
	const wait = throttleRemaining('pin');
	if (wait > 0) return fail('error.throttled', 429, { seconds: wait });
	const { pin } = await event.request.json();
	const lockKey = await verifyPin(session.dek, String(pin ?? ''));
	if (!lockKey) {
		registerFailure('pin');
		return fail('error.wrongPin', 403);
	}
	registerSuccess('pin');
	unlockPinForSession(session, lockKey);
	return json({ until: session.lockUntil });
};

export const DELETE: RequestHandler = (event) => {
	relockSession(requireSession(event));
	return json({ ok: true });
};
