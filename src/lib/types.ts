export type Lang = 'de' | 'en' | 'it';
export type Theme = 'system' | 'light' | 'dark';
export type SectionKind = 'daily' | 'feelings' | 'growth';

export type FieldValue = string | number | string[] | null;

/** Content of a daily entry (stored only encrypted). */
export interface EntryContent {
	mood: number | null;
	sections: Partial<Record<SectionKind, Record<string, FieldValue>>>;
	free: string;
}

export interface EntryMeta {
	id: string;
	date: string; // YYYY-MM-DD
	kinds: SectionKind[];
	locked: boolean;
	aiAllowed: boolean;
	revision: number;
	createdAt: string;
	updatedAt: string;
}

export interface Entry extends EntryMeta {
	content: EntryContent | null; // null = locked and PIN not entered
}

export interface RevisionInfo {
	revision: number;
	createdAt: string;
	content: EntryContent | null;
}

export type ProviderKind = 'anthropic' | 'openai' | 'google' | 'openai-compatible';

export interface AiAgent {
	id: string;
	name: string;
	provider: ProviderKind;
	preset: string; // e.g. "mistral", "ollama" – only for the interface
	baseUrl: string;
	model: string;
	apiKey: string;
	persona: string; // individual role / instructions
	tone: 'gentle' | 'balanced' | 'direct';
	maxFocusPoints: number;
}

/** Agent without the secret key – this is how it goes to the browser. */
export type PublicAiAgent = Omit<AiAgent, 'apiKey'> & { hasApiKey: boolean };

export interface Settings {
	name: string; // first name for the greeting (not a login name)
	language: Lang;
	theme: Theme;
	sessionMinutes: number;
	leaveMinutes: number; // lock after leaving the app (0 = never), see #lib/idle
	focusMode: boolean;
	welcomeHidden: boolean; // welcome card on the start page hidden
	aiInstructions: string; // own instructions to the AI (empty = default from #lib/server/ai/analyze)
	agents: AiAgent[];
	defaultAgentId: string | null;
}

export interface Analysis {
	id: string;
	createdAt: string;
	from: string;
	to: string;
	agentName: string;
	provider: ProviderKind | 'chat'; // 'chat' = answer pasted from an AI chat
	model: string;
	entryCount: number;
	question: string;
	body: string; // Markdown without the focus block
	focusPoints: string[];
	pinned: boolean; // current focus points on the dashboard
	moods?: { date: string; mood: number }[]; // only in analyses from 0.1.0-beta.2 to beta.5; no longer shown
}
