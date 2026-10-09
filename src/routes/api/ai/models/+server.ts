import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSession } from '$lib/server/auth';
import { fail } from '$lib/server/api';
import { loadSettings } from '$lib/server/settings';
import { AiError, listModels } from '$lib/server/ai/providers';
import type { AiAgent, ProviderKind } from '$lib/types';

/** Lädt die verfügbaren Modelle eines Anbieters (für das Agent-Formular). */
export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const body = await event.request.json();
	const stored = loadSettings(session.dek).agents.find((a) => a.id === body.id);
	const agent: AiAgent = {
		id: 'probe',
		name: 'probe',
		preset: String(body.preset ?? ''),
		provider: String(body.provider ?? 'openai-compatible') as ProviderKind,
		baseUrl: String(body.baseUrl ?? ''),
		model: '',
		apiKey: String(body.apiKey ?? '') || stored?.apiKey || '',
		persona: '',
		tone: 'balanced',
		maxFocusPoints: 4
	};
	try {
		return json({ models: await listModels(agent) });
	} catch (e) {
		if (e instanceof AiError) return fail(`insights.error.${e.code}`, 502, { detail: e.message });
		throw e;
	}
};
