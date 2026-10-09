import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import { isIsoDate } from '$lib/dates';
import { entriesForAi } from '$lib/server/entries';
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
		analyses: listAnalyses(session.dek).map((a) => ({ ...a, html: renderMarkdown(a.body) }))
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
		const markdown = buildChatMarkdown({
			options: {
				tone: TONES.includes(tone) ? tone : 'balanced',
				persona: '',
				maxFocusPoints: Math.min(7, Math.max(1, Number(form.get('focusCount')) || 4))
			},
			lang: loadSettings(session.dek).language,
			entries,
			...range,
			question: String(form.get('question') ?? '').slice(0, 2000)
		});
		return {
			markdown,
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
			pinned: false
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
