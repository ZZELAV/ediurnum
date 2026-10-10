import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/lib/markdown.ts';

test('Markdown-Renderer entschärft HTML', () => {
	const html = renderMarkdown('## Titel\n\n<script>alert(1)</script> **fett**\n\n- [x](javascript:alert(1))');
	assert.ok(!html.includes('<script>'));
	assert.ok(html.includes('&lt;script&gt;'));
	assert.ok(html.includes('<strong>fett</strong>'));
	assert.ok(!html.includes('href="javascript'));
});
