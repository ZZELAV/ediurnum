/** Public project on GitHub (source code, reporting bugs) */
export const REPO_URL = 'https://github.com/ZZELAV/ediurnum';
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;

/**
 * Section of a version from the changelog (without the link references at the end).
 * Without a matching version the topmost version section is returned.
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
