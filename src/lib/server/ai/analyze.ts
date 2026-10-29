import { randomUUID } from 'node:crypto';
import { complete } from './providers.ts';
import { formatEntries, plain } from '../export.ts';
import { langOf, translate } from '#lib/i18n/index.ts';
import { isEmptyProfile, profileMarkdown, type Profile } from '#lib/profile.ts';
import type { AiAgent, Analysis, Entry, Lang } from '#lib/types.ts';

/** Texts of the instructions to the AI and of the AI file, one set per language of the app. */
type PromptTexts = {
	/** Default instructions as paragraphs; the last one lists the headings of the answer. */
	instructions: string[];
	tones: Record<AiAgent['tone'], string>;
	persona: string;
	/** Last section of an answer from an AI chat (must be recognised by FOCUS_HEADING) */
	focusChat: (n: number) => string;
	/** <focus> block of an answer from an AI agent */
	focusApi: (n: number) => string;
	intro: (from: string, to: string) => string;
	question: (question: string) => string;
	title: string;
	task: string;
	about: string;
	aboutHint: string;
	entries: string;
};

const PROMPTS: Record<Lang, PromptTexts> = {
	de: {
		instructions: [
			'Du bist ein reflektierender Begleiter für ein persönliches Tagebuch namens "ediurnum".',
			'Du erhältst Tagebucheinträge (täglich Dankbarkeit und Erlebtes, wöchentlich Gefühle, monatlich Gelerntes und Weiterentwicklung) und hilfst der schreibenden Person, sich selbst besser zu verstehen und sich weiterzuentwickeln.',
			'Beziehe dich auf konkrete Einträge und Daten. Erfinde nichts, was nicht in den Einträgen steht. Du bist kein Therapeut und stellst keine Diagnosen; deuten Einträge auf eine ernste Krise hin, empfiehl behutsam, mit einer Vertrauensperson zu sprechen oder professionelle Hilfe zu suchen.',
			'Antworte auf Deutsch, formatiert als Markdown mit diesen Überschriften:',
			'## Überblick\n## Was gut läuft\n## Muster und Beobachtungen\n## Knackpunkte für die nächsten Wochen'
		],
		tones: {
			gentle: 'Sei warm, sanft und ermutigend. Formuliere Kritik behutsam.',
			balanced: 'Sei wertschätzend und ehrlich zugleich. Benenne Positives und Herausforderungen ausgewogen.',
			direct: 'Sei klar, direkt und konkret wie ein guter Coach. Keine Floskeln.'
		},
		persona: 'Individuelle Anweisungen der schreibenden Person:',
		focusChat: (n) =>
			`Schliesse mit einem letzten Abschnitt "## Fokuspunkte" ab, der genau ${n} kurze, konkrete und umsetzbare Fokuspunkte für die nächsten Wochen enthält (einer pro Zeile, jeweils mit "- " beginnend).`,
		focusApi: (n) =>
			`Schliesse mit genau ${n} kurzen, konkreten und umsetzbaren Fokuspunkten für die nächsten Wochen in einem Block wie diesem ab (einer pro Zeile, jeweils mit "- " beginnend):`,
		intro: (from, to) => `Hier sind meine Tagebucheinträge vom ${from} bis ${to}.`,
		question: (q) => `Bitte achte besonders auf Folgendes: ${q}`,
		title: '# ediurnum – Tagebuch-Auswertung',
		task: '## Dein Auftrag',
		about: '## Über mich (Selbsteinschätzung)',
		aboutHint:
			'Nutze das als Hintergrund, um mich zu verstehen und deine Rückmeldung darauf abzustimmen. Bewerte es nicht und wiederhole es nicht; beziehe dich darauf, wo es hilft.',
		entries: '## Meine Tagebucheinträge'
	},
	en: {
		instructions: [
			'You are a reflective companion for a personal journal called "ediurnum".',
			'You receive journal entries (daily gratitude and experiences, weekly feelings, monthly learning and growth) and help the writer understand themselves better and grow.',
			'Refer to concrete entries and dates. Do not invent anything that is not in the entries. You are not a therapist and do not make diagnoses; if entries suggest a serious crisis, gently recommend talking to a trusted person or professional help.',
			'Answer in English, formatted as Markdown with these headings:',
			'## Overview\n## What is going well\n## Patterns and observations\n## Key points for the coming weeks'
		],
		tones: {
			gentle: 'Be warm, gentle and encouraging. Phrase criticism carefully.',
			balanced: 'Be appreciative and honest at the same time. Balance positives and challenges.',
			direct: 'Be clear, direct and concrete like a good coach. No filler.'
		},
		persona: 'Individual instructions from the writer:',
		focusChat: (n) =>
			`Finish with a last section "## Focus points" containing exactly ${n} short, concrete and actionable focus points for the coming weeks (one per line, each starting with "- ").`,
		focusApi: (n) =>
			`Finish with exactly ${n} short, concrete and actionable focus points for the coming weeks inside a block like this (one per line, each starting with "- "):`,
		intro: (from, to) => `Here are my journal entries from ${from} to ${to}.`,
		question: (q) => `Please pay special attention to this: ${q}`,
		title: '# ediurnum – journal review',
		task: '## Your task',
		about: '## About me (self-assessment)',
		aboutHint:
			'Use this as background to understand me and to tailor your feedback. Do not judge it or repeat it back; refer to it where it helps.',
		entries: '## My journal entries'
	},
	it: {
		instructions: [
			'Sei un compagno di riflessione per un diario personale chiamato "ediurnum".',
			'Ricevi pagine di diario (ogni giorno gratitudine ed esperienze, ogni settimana sentimenti, ogni mese ciò che si è imparato e la crescita personale) e aiuti chi scrive a capirsi meglio e a crescere.',
			'Fai riferimento a pagine e date concrete. Non inventare nulla che non sia scritto nelle pagine. Non sei un terapeuta e non fai diagnosi; se le pagine fanno pensare a una crisi seria, consiglia con delicatezza di parlarne con una persona di fiducia o di cercare un aiuto professionale.',
			'Rispondi in italiano, in formato Markdown con questi titoli:',
			'## Panoramica\n## Cosa va bene\n## Schemi e osservazioni\n## Punti critici per le prossime settimane'
		],
		tones: {
			gentle: 'Sii caloroso, delicato e incoraggiante. Formula le critiche con tatto.',
			balanced: 'Sii riconoscente e onesto allo stesso tempo. Bilancia gli aspetti positivi e le difficoltà.',
			direct: 'Sii chiaro, diretto e concreto come un buon coach. Niente frasi fatte.'
		},
		persona: 'Istruzioni personali di chi scrive:',
		focusChat: (n) =>
			`Concludi con un’ultima sezione "## Punti di focus" che contenga esattamente ${n} punti di focus brevi, concreti e realizzabili per le prossime settimane (uno per riga, ciascuno preceduto da "- ").`,
		focusApi: (n) =>
			`Concludi con esattamente ${n} punti di focus brevi, concreti e realizzabili per le prossime settimane in un blocco come questo (uno per riga, ciascuno preceduto da "- "):`,
		intro: (from, to) => `Ecco le mie pagine di diario dal ${from} al ${to}.`,
		question: (q) => `Presta particolare attenzione a questo: ${q}`,
		title: '# ediurnum – analisi del diario',
		task: '## Il tuo compito',
		about: '## Su di me (autovalutazione)',
		aboutHint:
			'Usalo come contesto per capirmi e per adattare il tuo riscontro. Non giudicarlo e non ripeterlo; fai riferimento a esso dove è utile.',
		entries: '## Le mie pagine di diario'
	}
};

const prompts = (loc: string) => PROMPTS[langOf(loc)];

/**
 * Options for the instructions to the AI (AI agent or Markdown file for an AI chat).
 * `instructions`: the writer's own instructions (empty = default, see defaultInstructions).
 */
type PromptOptions = Pick<AiAgent, 'tone' | 'persona' | 'maxFocusPoints'> & { instructions?: string };

export const MAX_INSTRUCTIONS = 8000;

/**
 * Default instructions to the AI: role, rules and structure of the answer. The writer can adapt this part
 * in the insights; buildSystemPrompt adds the tone and the focus points.
 */
export function defaultInstructions(loc: string): string {
	return prompts(loc).instructions.join('\n\n');
}

/**
 * Instructions to the AI: own or default instructions, plus tone and the focus points at the end.
 * With `chat` the focus points get their own heading, so an answer copied from the chat
 * reliably contains them (see parseResponse).
 */
export function buildSystemPrompt(agent: PromptOptions, loc: string, format: 'api' | 'chat' = 'api'): string {
	const n = Math.min(7, Math.max(1, agent.maxFocusPoints || 4));
	const p = prompts(loc);
	return [
		agent.instructions?.trim() || defaultInstructions(loc),
		p.tones[agent.tone] ?? p.tones.balanced,
		agent.persona ? `${p.persona}\n${agent.persona}` : '',
		...(format === 'chat' ? [p.focusChat(n)] : [p.focusApi(n), '<focus>\n- …\n</focus>'])
	]
		.filter(Boolean)
		.join('\n\n');
}

export function buildUserPrompt(entries: Entry[], loc: string, from: string, to: string, question: string): string {
	const p = prompts(loc);
	const q = question.trim() ? `\n\n${p.question(plain(question))}` : '';
	return `${p.intro(from, to)}${q}\n\n${formatEntries(entries, loc)}`;
}

/** List items without bullets and bold text; duplicates and empty ones are dropped, at most seven. */
const listItems = (block: string) => [
	...new Set(
		block
			.split('\n')
			.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
			.filter(Boolean)
	)
].slice(0, 7);

/**
 * Heading of the section with the focus points in any language of the app: as Markdown ("## Focus points",
 * German "## Fokuspunkte", Italian "## Punti di focus", also with additions such as "for the coming weeks") or
 * as a plain line – that is how it arrives when the answer was selected and copied in the chat instead of using
 * the copy button.
 */
const FOCUS_HEADING =
	/^(?:#{1,4}[ \t]*)?\**[ \t]*(?:Fokuspunkte|Fokus-Punkte|Focus points|Punti di focus|Punti focali)\b[^\n]{0,60}?\**[ \t]*:?[ \t]*$/gim;

/**
 * Separates the focus points from the rest of the text: either a <focus> block (AI agent)
 * or the last section with the focus points, e.g. "## Focus points" (answer from an AI chat).
 */
export function parseResponse(text: string): { body: string; focusPoints: string[] } {
	text = text.replace(/\r\n/g, '\n');
	const block = text.match(/<(focus|fokus)>([\s\S]*?)<\/\1>/i);
	if (block) return { body: text.replace(block[0], '').trim(), focusPoints: listItems(block[2]) };
	// the last matching heading – according to the instructions the section comes last
	const heading = [...text.matchAll(FOCUS_HEADING)].at(-1);
	if (!heading || heading.index === undefined) return { body: text.trim(), focusPoints: [] };
	const after = text.slice(heading.index + heading[0].length);
	const end = after.search(/^#{1,4}\s/m);
	const section = end === -1 ? after : after.slice(0, end);
	const rest = end === -1 ? '' : after.slice(end);
	const focusPoints = listItems(section);
	if (!focusPoints.length) return { body: text.trim(), focusPoints: [] };
	return { body: (text.slice(0, heading.index) + rest).trim(), focusPoints };
}

/** Markdown file for any AI chat: instructions, self-assessment and entries in one document. */
export function buildChatMarkdown(params: {
	options: PromptOptions;
	/** Locale (e.g. de-CH) or language */
	locale: string;
	profile?: { profile: Profile; name: string } | null;
	entries: Entry[];
	from: string;
	to: string;
	question: string;
}): string {
	const { options, locale: loc, profile, entries, from, to, question } = params;
	const p = prompts(loc);
	const about =
		profile && (!isEmptyProfile(profile.profile) || profile.name.trim())
			? profileMarkdown(profile.profile, profile.name, (key) => translate(loc, key))
			: '';
	return [
		p.title,
		p.task,
		// expected answer headings as a list, so they don't disturb the structure of the file
		buildSystemPrompt(options, loc, 'chat').replace(/^## (.+)$/gm, '- `## $1`'),
		...(about ? [p.about, p.aboutHint, about] : []),
		p.entries,
		buildUserPrompt(entries, loc, from, to, question)
	].join('\n\n');
}

export async function runAnalysis(params: {
	agent: AiAgent;
	/** Locale (e.g. de-CH) or language */
	locale: string;
	entries: Entry[];
	from: string;
	to: string;
	question: string;
}): Promise<Analysis> {
	const { agent, locale: loc, entries, from, to, question } = params;
	const text = await complete(agent, buildSystemPrompt(agent, loc), buildUserPrompt(entries, loc, from, to, question));
	const { body, focusPoints } = parseResponse(text);
	return {
		id: randomUUID(),
		createdAt: new Date().toISOString(),
		from,
		to,
		agentName: agent.name,
		provider: agent.provider,
		model: agent.model,
		entryCount: entries.length,
		question,
		body,
		focusPoints,
		pinned: false
	};
}
