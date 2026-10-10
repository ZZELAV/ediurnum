export type Lang = 'de' | 'en';
export type Theme = 'system' | 'light' | 'dark';
export type SectionKind = 'erlebt' | 'gefuehl' | 'wachstum';
export const SECTION_KINDS: SectionKind[] = ['erlebt', 'gefuehl', 'wachstum'];

export type FieldValue = string | number | string[] | null;

/** Inhalt eines Tageseintrags (wird nur verschlüsselt gespeichert). */
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
	content: EntryContent | null; // null = gesperrt und PIN nicht eingegeben
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
	preset: string; // z. B. "mistral", "ollama" – nur für die Oberfläche
	baseUrl: string;
	model: string;
	apiKey: string;
	persona: string; // individuelle Rolle / Anweisungen
	tone: 'gentle' | 'balanced' | 'direct';
	maxFocusPoints: number;
}

/** Agent ohne geheimen Schlüssel – so geht er an den Browser. */
export type PublicAiAgent = Omit<AiAgent, 'apiKey'> & { hasApiKey: boolean };

export interface Settings {
	name: string; // Vorname für die Begrüssung (kein Login-Name)
	language: Lang;
	theme: Theme;
	sessionMinutes: number;
	focusMode: boolean;
	welcomeHidden: boolean; // Willkommenskarte auf der Startseite ausgeblendet
	aiInstructions: string; // eigener Auftrag an die KI (leer = Standard aus $lib/server/ai/analyze)
	agents: AiAgent[];
	defaultAgentId: string | null;
}

export interface Analysis {
	id: string;
	createdAt: string;
	from: string;
	to: string;
	agentName: string;
	provider: ProviderKind | 'chat'; // 'chat' = Antwort aus einem KI-Chat eingefügt
	model: string;
	entryCount: number;
	question: string;
	body: string; // Markdown ohne Fokus-Block
	focusPoints: string[];
	pinned: boolean; // aktuelle Fokuspunkte auf dem Dashboard
	moods?: { date: string; mood: number }[]; // Stimmungsverlauf im Zeitraum (ab 0.1.0-beta.2)
}
