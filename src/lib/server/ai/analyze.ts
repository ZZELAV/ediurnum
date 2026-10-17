import { randomUUID } from 'node:crypto';
import { complete } from './providers.ts';
import { formatEntries, plain } from '../export.ts';
import { translate } from '#lib/i18n/index.ts';
import { isEmptyProfile, profileMarkdown, type Profile } from '#lib/profile.ts';
import type { AiAgent, Analysis, Entry, Lang } from '#lib/types.ts';

/** The instructions to the AI exist in German and English; other languages get the English ones. */
const TONES: Record<AiAgent['tone'], Record<'de' | 'en', string>> = {
	gentle: {
		de: 'Sei warm, sanft und ermutigend. Formuliere Kritik behutsam.',
		en: 'Be warm, gentle and encouraging. Phrase criticism carefully.'
	},
	balanced: {
		de: 'Sei wertschätzend und ehrlich zugleich. Benenne Positives und Herausforderungen ausgewogen.',
		en: 'Be appreciative and honest at the same time. Balance positives and challenges.'
	},
	direct: {
		de: 'Sei klar, direkt und konkret wie ein guter Coach. Keine Floskeln.',
		en: 'Be clear, direct and concrete like a good coach. No filler.'
	}
};

/**
 * Options for the instructions to the AI (AI agent or Markdown file for an AI chat).
 * `instructions`: the writer's own instructions (empty = default, see defaultInstructions).
 */
export type PromptOptions = Pick<AiAgent, 'tone' | 'persona' | 'maxFocusPoints'> & { instructions?: string };

export const MAX_INSTRUCTIONS = 8000;

/**
 * Default instructions to the AI: role, rules and structure of the answer. The writer can adapt this part
 * in the insights; buildSystemPrompt adds the tone and the focus points.
 */
export function defaultInstructions(lang: Lang): string {
	if (lang !== 'de') {
		return [
			'You are a reflective companion for a personal journal called "ediurnum".',
			'You receive journal entries (daily gratitude and experiences, weekly feelings, monthly learning and growth) and help the writer understand themselves better and grow.',
			'Refer to concrete entries and dates. Do not invent anything that is not in the entries. You are not a therapist and do not make diagnoses; if entries suggest a serious crisis, gently recommend talking to a trusted person or professional help.',
			'Answer in English, formatted as Markdown with these headings:',
			'## Overview\n## What is going well\n## Patterns and observations\n## Key points for the coming weeks'
		].join('\n\n');
	}
	return [
		'Du bist ein reflektierender Begleiter für ein persönliches Tagebuch namens "ediurnum".',
		'Du erhältst Tagebucheinträge (täglich Dankbarkeit und Erlebtes, wöchentlich Gefühle, monatlich Gelerntes und Weiterentwicklung) und hilfst der schreibenden Person, sich selbst besser zu verstehen und sich weiterzuentwickeln.',
		'Beziehe dich auf konkrete Einträge und Daten. Erfinde nichts, was nicht in den Einträgen steht. Du bist kein Therapeut und stellst keine Diagnosen; deuten Einträge auf eine ernste Krise hin, empfiehl behutsam, mit einer Vertrauensperson zu sprechen oder professionelle Hilfe zu suchen.',
		'Antworte auf Deutsch, formatiert als Markdown mit diesen Überschriften:',
		'## Überblick\n## Was gut läuft\n## Muster und Beobachtungen\n## Knackpunkte für die nächsten Wochen'
	].join('\n\n');
}

/**
 * Instructions to the AI: own or default instructions, plus tone and the focus points at the end.
 * With `chat` the focus points get their own heading, so an answer copied from the chat
 * reliably contains them (see parseResponse).
 */
export function buildSystemPrompt(agent: PromptOptions, lang: Lang, format: 'api' | 'chat' = 'api'): string {
	const n = Math.min(7, Math.max(1, agent.maxFocusPoints || 4));
	const instructions = agent.instructions?.trim() || defaultInstructions(lang);
	if (lang !== 'de') {
		return [
			instructions,
			TONES[agent.tone]?.en ?? TONES.balanced.en,
			agent.persona ? `Individual instructions from the writer:\n${agent.persona}` : '',
			...(format === 'chat'
				? [
						`Finish with a last section "## Focus points" containing exactly ${n} short, concrete and actionable focus points for the coming weeks (one per line, each starting with "- ").`
					]
				: [
						`Finish with exactly ${n} short, concrete and actionable focus points for the coming weeks inside a block like this (one per line, each starting with "- "):`,
						'<focus>\n- …\n</focus>'
					])
		]
			.filter(Boolean)
			.join('\n\n');
	}
	return [
		instructions,
		TONES[agent.tone]?.de ?? TONES.balanced.de,
		agent.persona ? `Individuelle Anweisungen der schreibenden Person:\n${agent.persona}` : '',
		...(format === 'chat'
			? [
					`Schliesse mit einem letzten Abschnitt "## Fokuspunkte" ab, der genau ${n} kurze, konkrete und umsetzbare Fokuspunkte für die nächsten Wochen enthält (einer pro Zeile, jeweils mit "- " beginnend).`
				]
			: [
					`Schliesse mit genau ${n} kurzen, konkreten und umsetzbaren Fokuspunkten für die nächsten Wochen in einem Block wie diesem ab (einer pro Zeile, jeweils mit "- " beginnend):`,
					'<focus>\n- …\n</focus>'
				])
	]
		.filter(Boolean)
		.join('\n\n');
}

export function buildUserPrompt(entries: Entry[], lang: Lang, from: string, to: string, question: string): string {
	const intro =
		lang !== 'de'
			? `Here are my journal entries from ${from} to ${to}.`
			: `Hier sind meine Tagebucheinträge vom ${from} bis ${to}.`;
	const q = question.trim()
		? lang !== 'de'
			? `\n\nPlease pay special attention to this: ${plain(question)}`
			: `\n\nBitte achte besonders auf Folgendes: ${plain(question)}`
		: '';
	return `${intro}${q}\n\n${formatEntries(entries, lang)}`;
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
 * Heading of the section with the focus points: as Markdown ("## Focus points" or the German "## Fokuspunkte",
 * also with additions such as "for the coming weeks") or as a plain line – that is how it arrives when the
 * answer was selected and copied in the chat instead of using the copy button.
 */
const FOCUS_HEADING = /^(?:#{1,4}[ \t]*)?\**[ \t]*(?:Fokuspunkte|Fokus-Punkte|Focus points)\b[^\n]{0,60}?\**[ \t]*:?[ \t]*$/gim;

/**
 * Separates the focus points from the rest of the text: either a <focus> block (AI agent)
 * or the last section "## Fokuspunkte" / "## Focus points" (answer from an AI chat).
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
	lang: Lang;
	profile?: { profile: Profile; name: string } | null;
	entries: Entry[];
	from: string;
	to: string;
	question: string;
}): string {
	const { options, lang, profile, entries, from, to, question } = params;
	const en = lang !== 'de';
	const about =
		profile && (!isEmptyProfile(profile.profile) || profile.name.trim())
			? profileMarkdown(profile.profile, profile.name, (key) => translate(lang, key))
			: '';
	return [
		en ? '# ediurnum – journal review' : '# ediurnum – Tagebuch-Auswertung',
		en ? '## Your task' : '## Dein Auftrag',
		// expected answer headings as a list, so they don't disturb the structure of the file
		buildSystemPrompt(options, lang, 'chat').replace(/^## (.+)$/gm, '- `## $1`'),
		...(about
			? [
					en ? '## About me (self-assessment)' : '## Über mich (Selbsteinschätzung)',
					en
						? 'Use this as background to understand me and to tailor your feedback. Do not judge it or repeat it back; refer to it where it helps.'
						: 'Nutze das als Hintergrund, um mich zu verstehen und deine Rückmeldung darauf abzustimmen. Bewerte es nicht und wiederhole es nicht; beziehe dich darauf, wo es hilft.',
					about
				]
			: []),
		en ? '## My journal entries' : '## Meine Tagebucheinträge',
		buildUserPrompt(entries, lang, from, to, question)
	].join('\n\n');
}

export async function runAnalysis(params: {
	agent: AiAgent;
	lang: Lang;
	entries: Entry[];
	from: string;
	to: string;
	question: string;
}): Promise<Analysis> {
	const { agent, lang, entries, from, to, question } = params;
	const text = await complete(agent, buildSystemPrompt(agent, lang), buildUserPrompt(entries, lang, from, to, question));
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
