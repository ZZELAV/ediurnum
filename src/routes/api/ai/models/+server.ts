import type { RequestHandler } from './$types';
import { requireSession } from '#lib/server/auth.ts';
import { fail, readJson } from '#lib/server/api.ts';
import { loadSettings } from '#lib/server/settings.ts';
import { AiError, listModels } from '#lib/server/ai/providers.ts';
import type { AiAgent, ProviderKind } from '#lib/types.ts';

/** Loads the available models of a provider (for the agent form). */
export const POST: RequestHandler = async (event) => {
	const session = requireSession(event);
	const body = await readJson(event.request);
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
		return Response.json({ models: await listModels(agent) });
	} catch (e) {
		if (e instanceof AiError) return fail(`insights.error.${e.code}`, 502, { detail: e.message });
		throw e;
	}
};
