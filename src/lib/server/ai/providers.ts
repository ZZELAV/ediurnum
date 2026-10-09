import Anthropic from '@anthropic-ai/sdk';
import type { AiAgent } from '$lib/types';

/**
 * Einheitliche Schnittstelle zu den KI-Anbietern.
 * - Anthropic: offizielles SDK
 * - OpenAI und alle OpenAI-kompatiblen Anbieter (Mistral, xAI, DeepSeek, OpenRouter, Ollama, …): Chat Completions
 * - Google Gemini: generateContent-REST-Schnittstelle
 */

export class AiError extends Error {
	constructor(
		public code: 'auth' | 'nokey' | 'rate_limit' | 'refusal' | 'network' | 'config' | 'provider',
		message: string
	) {
		super(message);
	}
}

const TIMEOUT_MS = 5 * 60 * 1000;

// Modelle, die den serverseitigen Refusal-Fallback ("default") unterstützen.
const ANTHROPIC_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

function trimSlash(url: string) {
	return url.replace(/\/+$/, '');
}

async function http(url: string, init: RequestInit): Promise<any> {
	let res: Response;
	try {
		res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (e) {
		throw new AiError('network', (e as Error).message);
	}
	const text = await res.text();
	let body: any = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = { raw: text.slice(0, 500) };
	}
	if (!res.ok) {
		const msg = body?.error?.message ?? body?.message ?? body?.raw ?? res.statusText;
		if (res.status === 401 || res.status === 403) throw new AiError('auth', msg);
		if (res.status === 429) throw new AiError('rate_limit', msg);
		throw new AiError('provider', `${res.status}: ${msg}`);
	}
	return body;
}

// --------------------------------------------------------------------------
// Anthropic
// --------------------------------------------------------------------------

function anthropicClient(agent: AiAgent) {
	return new Anthropic({
		apiKey: agent.apiKey,
		...(agent.baseUrl ? { baseURL: trimSlash(agent.baseUrl) } : {}),
		timeout: TIMEOUT_MS
	});
}

async function anthropicComplete(agent: AiAgent, system: string, user: string): Promise<string> {
	const client = anthropicClient(agent);
	const useFallback = ANTHROPIC_FALLBACK_MODELS.has(agent.model) && !agent.baseUrl;
	try {
		const message = await client.beta.messages
			.stream({
				model: agent.model,
				max_tokens: 16000,
				system,
				messages: [{ role: 'user', content: user }],
				output_config: { effort: 'high' },
				...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
			})
			.finalMessage();
		if (message.stop_reason === 'refusal') {
			throw new AiError('refusal', message.stop_details?.explanation ?? 'refusal');
		}
		return message.content
			.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
			.map((b) => b.text)
			.join('\n')
			.trim();
	} catch (e) {
		if (e instanceof AiError) throw e;
		if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
			throw new AiError('auth', e.message);
		}
		if (e instanceof Anthropic.RateLimitError) throw new AiError('rate_limit', e.message);
		if (e instanceof Anthropic.APIConnectionError) throw new AiError('network', e.message);
		if (e instanceof Anthropic.APIError) throw new AiError('provider', `${e.status}: ${e.message}`);
		throw e;
	}
}

async function anthropicModels(agent: AiAgent): Promise<string[]> {
	const client = anthropicClient(agent);
	const ids: string[] = [];
	try {
		for await (const m of client.models.list()) ids.push(m.id);
	} catch (e) {
		if (e instanceof Anthropic.AuthenticationError) throw new AiError('auth', e.message);
		if (e instanceof Anthropic.APIError) throw new AiError('provider', e.message);
		throw new AiError('network', (e as Error).message);
	}
	return ids;
}

// --------------------------------------------------------------------------
// OpenAI & OpenAI-kompatibel
// --------------------------------------------------------------------------

function openaiHeaders(agent: AiAgent): Record<string, string> {
	const h: Record<string, string> = { 'content-type': 'application/json' };
	if (agent.apiKey) h.authorization = `Bearer ${agent.apiKey}`;
	return h;
}

async function openaiComplete(agent: AiAgent, system: string, user: string): Promise<string> {
	if (!agent.baseUrl) throw new AiError('config', 'baseUrl');
	const body = await http(`${trimSlash(agent.baseUrl)}/chat/completions`, {
		method: 'POST',
		headers: openaiHeaders(agent),
		body: JSON.stringify({
			model: agent.model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			]
		})
	});
	const choice = body?.choices?.[0];
	if (choice?.finish_reason === 'content_filter') throw new AiError('refusal', 'content_filter');
	const content = choice?.message?.content;
	if (typeof content !== 'string') throw new AiError('provider', 'Leere Antwort');
	return content.trim();
}

async function openaiModels(agent: AiAgent): Promise<string[]> {
	if (!agent.baseUrl) throw new AiError('config', 'baseUrl');
	const body = await http(`${trimSlash(agent.baseUrl)}/models`, { headers: openaiHeaders(agent) });
	return (body?.data ?? []).map((m: { id: string }) => m.id).sort();
}

// --------------------------------------------------------------------------
// Google Gemini
// --------------------------------------------------------------------------

function geminiBase(agent: AiAgent) {
	return trimSlash(agent.baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
}

async function geminiComplete(agent: AiAgent, system: string, user: string): Promise<string> {
	const model = agent.model.replace(/^models\//, '');
	const body = await http(`${geminiBase(agent)}/models/${encodeURIComponent(model)}:generateContent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-goog-api-key': agent.apiKey },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: system }] },
			contents: [{ role: 'user', parts: [{ text: user }] }]
		})
	});
	const cand = body?.candidates?.[0];
	if (!cand && body?.promptFeedback?.blockReason) throw new AiError('refusal', body.promptFeedback.blockReason);
	const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
	if (!text) throw new AiError(cand?.finishReason === 'SAFETY' ? 'refusal' : 'provider', 'Leere Antwort');
	return text.trim();
}

async function geminiModels(agent: AiAgent): Promise<string[]> {
	const body = await http(`${geminiBase(agent)}/models?pageSize=200`, {
		headers: { 'x-goog-api-key': agent.apiKey }
	});
	return (body?.models ?? [])
		.filter((m: { supportedGenerationMethods?: string[] }) =>
			(m.supportedGenerationMethods ?? []).includes('generateContent')
		)
		.map((m: { name: string }) => m.name.replace(/^models\//, ''));
}

// --------------------------------------------------------------------------

/** Schlüssel nie aus Umgebungsvariablen des Servers "erben" – nur der im Agenten hinterlegte zählt. */
function requireKey(agent: AiAgent) {
	if (agent.provider !== 'openai-compatible' && !agent.apiKey) throw new AiError('nokey', 'API key missing');
}

export function complete(agent: AiAgent, system: string, user: string): Promise<string> {
	if (!agent.model) throw new AiError('config', 'model');
	requireKey(agent);
	switch (agent.provider) {
		case 'anthropic':
			return anthropicComplete(agent, system, user);
		case 'google':
			return geminiComplete(agent, system, user);
		default:
			return openaiComplete(agent, system, user);
	}
}

export async function listModels(agent: AiAgent): Promise<string[]> {
	requireKey(agent);
	switch (agent.provider) {
		case 'anthropic':
			return anthropicModels(agent);
		case 'google':
			return geminiModels(agent);
		default:
			return openaiModels(agent);
	}
}
