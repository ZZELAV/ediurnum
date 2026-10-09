import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import { isIsoDate } from '$lib/dates';
import { entriesForAi, moodSeries } from '$lib/server/entries';
import { loadProfile } from '$lib/server/profile';
import { isEmptyProfile } from '$lib/profile';
import { log } from '$lib/server/log';
import { loadSettings } from '$lib/server/settings';
import { deleteAnalysis, listAnalyses, pinAnalysis, saveAnalysis } from '$lib/server/analyses';
import { buildChatMarkdown, parseResponse } from '$lib/server/ai/analyze';
import { renderMarkdown } from '$lib/markdown';
import type { AiAgent } from '$lib/types';

/**
 * Einsichten über einen beliebigen KI-Chat: Die App erstellt eine Markdown-Datei mit Auftrag
 * und Einträgen; die Antwort der KI kann zurückkopiert und als Auswertung gespeichert werden.
 * (KI-Agenten mit API-Schlüssel folgen in einem späteren Release – siehe $lib/server/ai.)
 */
export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	return {
		analyses: listAnalyses(session.dek).map((a) => ({
			...a,
			// ältere Auswertungen ohne gespeicherten Verlauf: aus den aktuellen Einträgen berechnen
			moods: a.moods ?? moodSeries(session, a.from, a.to),
			html: renderMarkdown(a.body)
		})),
		hasProfile: !isEmptyProfile(loadProfile(session.dek))
	};
};

const TONES: AiAgent['tone'][] = ['gentle', 'balanced', 'direct'];

function period(form: FormData) {
	const from = String(form.get('from') ?? '');
	const to = String(form.get('to') ?? '');
	return isIsoDate(from) && isIsoDate(to) && from <= to ? { from, to } : null;
}

export const actions: Actions = {
	/** Markdown-Datei für einen KI-Chat erstellen. */
	prompt: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const range = period(form);
		if (!range) return fail(400, { error: 'common.error' });
		const { entries } = entriesForAi(session, range.from, range.to);
		if (entries.length === 0) return fail(400, { error: 'insights.noEntries' });

		const tone = form.get('tone') as AiAgent['tone'];
		const settings = loadSettings(session.dek);
		const withProfile = form.get('profile') === 'on';
		const markdown = buildChatMarkdown({
			options: {
				tone: TONES.includes(tone) ? tone : 'balanced',
				persona: '',
				maxFocusPoints: Math.min(7, Math.max(1, Number(form.get('focusCount')) || 4))
			},
			lang: settings.language,
			profile: withProfile ? { profile: loadProfile(session.dek), name: settings.name } : null,
			entries,
			...range,
			question: String(form.get('question') ?? '').slice(0, 2000)
		});
		log.info('AI file created', { entries: entries.length, profile: withProfile });
		return {
			markdown,
			moods: moodSeries(session, range.from, range.to),
			count: entries.length,
			...range,
			filename: `ediurnum-${range.from}_${range.to}.md`
		};
	},

	/** Antwort aus dem KI-Chat als Auswertung speichern. */
	import: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const range = period(form);
		const answer = String(form.get('answer') ?? '').trim().slice(0, 50_000);
		if (!range) return fail(400, { error: 'common.error' });
		if (!answer) return fail(400, { error: 'insights.answerEmpty' });

		const { body, focusPoints } = parseResponse(answer);
		const analysis = {
			id: randomUUID(),
			createdAt: new Date().toISOString(),
			...range,
			agentName: 'Chat',
			provider: 'chat' as const,
			model: '',
			entryCount: Math.max(0, Number(form.get('count')) || 0),
			question: String(form.get('question') ?? '').slice(0, 2000),
			body,
			focusPoints,
			pinned: false,
			moods: moodSeries(session, range.from, range.to)
		};
		saveAnalysis(session.dek, analysis);
		if (focusPoints.length) pinAnalysis(session.dek, analysis.id);
		return { saved: analysis.id, focusCount: focusPoints.length };
	},

	pin: async ({ request, locals }) => {
		const form = await request.formData();
		pinAnalysis(locals.session!.dek, String(form.get('id') ?? '') || null);
		return { ok: true };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		deleteAnalysis(String(form.get('id') ?? ''));
		return { ok: true };
	}
};
