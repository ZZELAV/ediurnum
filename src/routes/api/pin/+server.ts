import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { fail, readJson } from '#lib/server/api.ts';
import {
	hasPin,
	registerFailure,
	registerSuccess,
	relockSession,
	throttleRemaining,
	unlockPinForSession,
	verifyPin
} from '#lib/server/vault.ts';

/** Enter the PIN: locked entries become readable in this session for 10 minutes. */
export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	if (!hasPin()) return fail('error.noPin');
	const wait = throttleRemaining('pin');
	if (wait > 0) return fail('error.throttled', 429, { seconds: wait });
	const { pin } = await readJson(event.request);
	const lockKey = await verifyPin(session.dek, String(pin ?? ''));
	if (!lockKey) {
		registerFailure('pin');
		return fail('error.wrongPin', 403);
	}
	registerSuccess('pin');
	unlockPinForSession(session, lockKey);
	return Response.json({ until: session.lockUntil });
};

export const DELETE: RequestHandler = (event) => {
	relockSession(requireSession(event));
	return Response.json({ ok: true });
};
