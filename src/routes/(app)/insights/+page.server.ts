import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import { isIsoDate } from '#lib/dates.ts';
import { entriesForAi } from '#lib/server/entries.ts';
import { loadProfile } from '#lib/server/profile.ts';
import { isEmptyProfile } from '#lib/profile.ts';
import { log } from '#lib/server/log.ts';
import { loadSettings, saveSettings } from '#lib/server/settings.ts';
import { deleteAnalysis, listAnalyses, pinAnalysis, saveAnalysis } from '#lib/server/analyses.ts';
import { buildChatMarkdown, defaultInstructions, MAX_INSTRUCTIONS, parseResponse } from '#lib/server/ai/analyze.ts';
import { renderMarkdown } from '#lib/markdown.ts';
import type { AiAgent } from '#lib/types.ts';

/**
 * Insights through any AI chat: the app creates a Markdown file with instructions
 * and entries; the AI's answer can be copied back and saved as an analysis.
 * (AI agents with an API key follow in a later release – see #lib/server/ai.)
 */
export const load: PageServerLoad = ({ locals }) => {
	const session = locals.session!;
	const settings = loadSettings(session.dek);
	return {
		instructions: { custom: settings.aiInstructions, default: defaultInstructions(settings.language) },
		// the mood chart of older analyses (`moods`) is no longer shown – it is in the statistics
		analyses: listAnalyses(session.dek).map(({ moods: _, ...a }) => ({ ...a, html: renderMarkdown(a.body) })),
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
	/** Creates the Markdown file for an AI chat. */
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
				maxFocusPoints: Math.min(7, Math.max(1, Number(form.get('focusCount')) || 4)),
				instructions: settings.aiInstructions
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
			count: entries.length,
			...range,
			filename: `ediurnum-${range.from}_${range.to}.md`
		};
	},

	/** Saves own instructions to the AI; empty or equal to the default = use the default. */
	instructions: async ({ request, locals }) => {
		const session = locals.session!;
		const form = await request.formData();
		const settings = loadSettings(session.dek);
		const text = String(form.get('instructions') ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_INSTRUCTIONS);
		settings.aiInstructions = form.get('reset') || text === defaultInstructions(settings.language) ? '' : text;
		saveSettings(session.dek, settings);
		return { instructionsSaved: settings.aiInstructions ? 'custom' : 'default' };
	},

	/** Saves the answer from the AI chat as an analysis. */
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
