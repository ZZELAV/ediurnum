import type { ProviderKind } from './types.ts';

export interface AiPreset {
	id: string;
	label: string;
	provider: ProviderKind;
	baseUrl: string;
	defaultModel: string;
	needsKey: boolean;
}

/**
 * Vorlagen für die grossen KI-Anbieter. Alle Anbieter mit OpenAI-kompatibler
 * Schnittstelle laufen über denselben Adapter; nur Basis-URL und Modell unterscheiden sich.
 * Modellnamen ändern sich häufig – über "Modelle laden" holt die App die aktuelle Liste.
 */
export const AI_PRESETS: AiPreset[] = [
	{
		id: 'anthropic',
		label: 'Anthropic (Claude)',
		provider: 'anthropic',
		baseUrl: '',
		defaultModel: 'claude-opus-5-5',
		needsKey: true
	},
	{
		id: 'openai',
		label: 'OpenAI (ChatGPT)',
		provider: 'openai',
		baseUrl: 'https://api.openai.com/v1',
		defaultModel: '',
		needsKey: true
	},
	{
		id: 'google',
		label: 'Google (Gemini)',
		provider: 'google',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		defaultModel: '',
		needsKey: true
	},
	{
		id: 'mistral',
		label: 'Mistral AI',
		provider: 'openai-compatible',
		baseUrl: 'https://api.mistral.ai/v1',
		defaultModel: '',
		needsKey: true
	},
	{
		id: 'xai',
		label: 'xAI (Grok)',
		provider: 'openai-compatible',
		baseUrl: 'https://api.x.ai/v1',
		defaultModel: '',
		needsKey: true
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		provider: 'openai-compatible',
		baseUrl: 'https://api.deepseek.com/v1',
		defaultModel: '',
		needsKey: true
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		provider: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		defaultModel: '',
		needsKey: true
	},
	{
		id: 'ollama',
		label: 'Ollama (lokal)',
		provider: 'openai-compatible',
		baseUrl: 'http://ollama:11434/v1',
		defaultModel: '',
		needsKey: false
	},
	{
		id: 'custom',
		label: 'OpenAI-kompatibel (eigener Endpunkt)',
		provider: 'openai-compatible',
		baseUrl: '',
		defaultModel: '',
		needsKey: false
	}
];

export function presetById(id: string): AiPreset {
	return AI_PRESETS.find((p) => p.id === id) ?? AI_PRESETS[AI_PRESETS.length - 1];
}
