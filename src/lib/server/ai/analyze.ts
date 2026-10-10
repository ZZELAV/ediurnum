import { randomUUID } from 'node:crypto';
import { complete } from './providers.ts';
import { SECTIONS } from '#lib/templates.ts';
import { translate } from '#lib/i18n/index.ts';
import { isEmptyProfile, profileMarkdown, type Profile } from '#lib/profile.ts';
import type { AiAgent, Analysis, Entry, Lang } from '#lib/types.ts';

const TONES: Record<AiAgent['tone'], Record<Lang, string>> = {
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
 * Einstellungen für den Auftrag an die KI (KI-Agent oder Markdown-Datei für einen KI-Chat).
 * `instructions`: eigener Auftrag der schreibenden Person (leer = Standard, siehe defaultInstructions).
 */
export type PromptOptions = Pick<AiAgent, 'tone' | 'persona' | 'maxFocusPoints'> & { instructions?: string };

export const MAX_INSTRUCTIONS = 8000;

/**
 * Standard-Auftrag an die KI: Rolle, Regeln und Gliederung der Antwort. Diesen Teil kann die
 * schreibende Person in den Einsichten anpassen; Tonfall und Fokuspunkte ergänzt buildSystemPrompt.
 */
export function defaultInstructions(lang: Lang): string {
	if (lang === 'en') {
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
 * Auftrag an die KI: eigener oder Standard-Auftrag, dazu Tonfall und die Fokuspunkte am Schluss.
 * Bei `chat` stehen die Fokuspunkte unter einer eigenen Überschrift, damit eine aus dem Chat
 * kopierte Antwort sie zuverlässig enthält (siehe parseResponse).
 */
export function buildSystemPrompt(agent: PromptOptions, lang: Lang, format: 'api' | 'chat' = 'api'): string {
	const n = Math.min(7, Math.max(1, agent.maxFocusPoints || 4));
	const instructions = agent.instructions?.trim() || defaultInstructions(lang);
	if (lang === 'en') {
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

/**
 * Text aus dem Tagebuch für die Datei: Zeilen, die mit „#“ beginnen, würden sonst zu Überschriften
 * und brächten die Gliederung der Datei (Auftrag, Einträge, Tage) durcheinander.
 */
const plain = (text: string) => text.trim().replace(/^(\s*)#/gm, '$1\\#');

export function formatEntries(entries: Entry[], lang: Lang): string {
	const t = (key: string) => translate(lang, key);
	const dateFmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const out: string[] = [];
	for (const e of entries) {
		if (!e.content) continue;
		const c = e.content;
		const lines: string[] = [`### ${dateFmt.format(new Date(e.date + 'T00:00:00Z'))}`];
		if (c.mood) lines.push(`${t('entry.mood')}: ${c.mood}/5 (${t(`mood.${c.mood}`)})`);
		for (const def of SECTIONS) {
			const sec = c.sections[def.kind];
			if (!sec) continue;
			const parts: string[] = [];
			for (const f of def.fields) {
				const v = sec[f.id];
				const label = t(`section.${def.kind}.${f.id}`);
				if (typeof v === 'string' && v.trim()) parts.push(`- ${label}: ${plain(v)}`);
				else if (typeof v === 'number') parts.push(`- ${label}: ${v}/5`);
				else if (Array.isArray(v)) {
					const vals = v.filter((x) => x.trim());
					if (!vals.length) continue;
					const shown = f.type === 'chips' ? vals.map((x) => t(`emotion.${x}`)) : vals.map(plain);
					parts.push(`- ${label}: ${shown.join('; ')}`);
				}
			}
			if (parts.length) lines.push(`**${t(`section.${def.kind}.title`)}**`, ...parts);
		}
		if (c.free.trim()) lines.push(`**${t('entry.free')}**`, plain(c.free));
		out.push(lines.join('\n'));
	}
	return out.join('\n\n');
}

export function buildUserPrompt(entries: Entry[], lang: Lang, from: string, to: string, question: string): string {
	const intro =
		lang === 'en'
			? `Here are my journal entries from ${from} to ${to}.`
			: `Hier sind meine Tagebucheinträge vom ${from} bis ${to}.`;
	const q = question.trim()
		? lang === 'en'
			? `\n\nPlease pay special attention to this: ${plain(question)}`
			: `\n\nBitte achte besonders auf Folgendes: ${plain(question)}`
		: '';
	return `${intro}${q}\n\n${formatEntries(entries, lang)}`;
}

/** Listenpunkte ohne Aufzählungszeichen und Fettschrift; doppelte und leere entfallen, höchstens sieben. */
const listItems = (block: string) => [
	...new Set(
		block
			.split('\n')
			.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
			.filter(Boolean)
	)
].slice(0, 7);

/**
 * Überschrift des Abschnitts mit den Fokuspunkten: als Markdown („## Fokuspunkte“, auch mit Zusatz wie
 * „für die nächsten Wochen“) oder als blosse Zeile – so kommt sie an, wenn die Antwort im Chat
 * markiert und kopiert statt über den Kopieren-Knopf übernommen wurde.
 */
const FOCUS_HEADING = /^(?:#{1,4}[ \t]*)?\**[ \t]*(?:Fokuspunkte|Fokus-Punkte|Focus points)\b[^\n]{0,60}?\**[ \t]*:?[ \t]*$/gim;

/**
 * Trennt die Fokuspunkte vom restlichen Text: entweder ein <focus>-Block (KI-Agent)
 * oder der letzte Abschnitt „## Fokuspunkte“ / „## Focus points“ (Antwort aus einem KI-Chat).
 */
export function parseResponse(text: string): { body: string; focusPoints: string[] } {
	text = text.replace(/\r\n/g, '\n');
	const block = text.match(/<(focus|fokus)>([\s\S]*?)<\/\1>/i);
	if (block) return { body: text.replace(block[0], '').trim(), focusPoints: listItems(block[2]) };
	// die letzte passende Überschrift – der Abschnitt steht laut Auftrag am Schluss
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

/** Markdown-Datei für einen beliebigen KI-Chat: Auftrag, Selbsteinschätzung und Einträge in einem Dokument. */
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
	const en = lang === 'en';
	const about =
		profile && (!isEmptyProfile(profile.profile) || profile.name.trim())
			? profileMarkdown(profile.profile, profile.name, (key) => translate(lang, key))
			: '';
	return [
		en ? '# ediurnum – journal review' : '# ediurnum – Tagebuch-Auswertung',
		en ? '## Your task' : '## Dein Auftrag',
		// Vorgegebene Antwort-Überschriften als Liste, damit sie die Gliederung der Datei nicht stören
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
