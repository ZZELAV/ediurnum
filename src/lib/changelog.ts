export const CHANGELOG_URL = 'https://github.com/ZZELAV/ediurnum/blob/main/CHANGELOG.md';

/**
 * Abschnitt einer Version aus dem Changelog (ohne Linkverweise am Ende).
 * Ohne passende Version wird der oberste Versionsabschnitt geliefert.
 */
export function changelogSection(md: string, version: string): { version: string; date: string; body: string } | null {
	const sections = md
		.replace(/\r\n/g, '\n')
		.split(/^## /m)
		.slice(1)
		.map((s) => {
			const [heading, ...rest] = s.split('\n');
			const v = heading.match(/^\[([^\]]+)\]/)?.[1] ?? heading.trim();
			const body = rest
				.filter((l) => !/^\[[^\]]+\]:\s/.test(l))
				.join('\n')
				.trim();
			const date = heading.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
			return { version: v, date, body };
		});
	const found = sections.find((s) => s.version === version) ?? sections[0];
	return found ?? null;
}
