import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { hasPin } from '#lib/server/vault.ts';
import { pinnedAnalysis } from '#lib/server/analyses.ts';
import { todayIso } from '#lib/dates.ts';

export const load: LayoutServerLoad = ({ locals }) => {
	const session = locals.session;
	if (!session) redirect(303, '/login');
	const pinned = pinnedAnalysis(session.dek);
	return {
		today: todayIso(),
		hasPin: hasPin(),
		name: locals.settings?.name ?? '',
		focusMode: locals.settings?.focusMode ?? false,
		sessionMinutes: locals.settings?.sessionMinutes ?? 30,
		leaveMinutes: locals.settings?.leaveMinutes ?? 1,
		pinUnlockedUntil: session.lockKey ? session.lockUntil : 0,
		focus: pinned ? { id: pinned.id, createdAt: pinned.createdAt, points: pinned.focusPoints } : null
	};
};
