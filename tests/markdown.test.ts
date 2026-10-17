import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/lib/markdown.ts';

test('HTML is escaped, only http(s) links', () => {
	const html = renderMarkdown('## Titel\n\n<script>alert(1)</script> **fett**\n\n- [x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>');
	assert.ok(!html.includes('<script>'));
	assert.ok(html.includes('&lt;script&gt;'));
	assert.ok(!html.includes('<img'));
	assert.ok(html.includes('<strong>fett</strong>'));
	assert.ok(!html.includes('href="javascript'));
});

test('links open in a new tab without a referrer; quotes do not break out', () => {
	const html = renderMarkdown('[Doku](https://example.com/a?b=1) und [x](https://e.com/"onmouseover="alert(1))');
	assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1" rel="noopener noreferrer" target="_blank">Doku<\/a>/);
	assert.doesNotMatch(html, /" onmouseover="|"onmouseover="/);
});

test('headings one level lower, at most h4', () => {
	assert.equal(renderMarkdown('# A'), '<h2>A</h2>');
	assert.equal(renderMarkdown('### C'), '<h4>C</h4>');
	assert.equal(renderMarkdown('#### D'), '<h4>D</h4>');
	assert.equal(renderMarkdown('#kein Titel'), '<p>#kein Titel</p>');
});

test('lists, paragraphs with line breaks, horizontal rule, code, italic', () => {
	const html = renderMarkdown('- a\n* b\n\n1. eins\n2) zwei\n\nZeile 1\r\nZeile 2\n\n---\n\n`code` und *kursiv*');
	assert.equal(
		html,
		[
			'<ul>',
			'<li>a</li>',
			'<li>b</li>',
			'</ul>',
			'<ol>',
			'<li>eins</li>',
			'<li>zwei</li>',
			'</ol>',
			'<p>Zeile 1<br>Zeile 2</p>',
			'<hr>',
			'<p><code>code</code> und <em>kursiv</em></p>'
		].join('\n')
	);
});

test('Leerer Text', () => {
	assert.equal(renderMarkdown(''), '');
	assert.equal(renderMarkdown('\n\n'), '');
});

test('tables: header, alignment, rows; cells adjusted and escaped', () => {
	const html = renderMarkdown(
		['Vorher', '', '| Bereich | Wert | Trend |', '|:--|:-:|--:|', '| Schlaf | **gut** | ↑ |', '| Arbeit | <b>x</b> |', 'Arbeit \\| Freizeit | 3 | – | zu viel', '', 'Nachher'].join('\n')
	);
	assert.equal(
		html,
		[
			'<p>Vorher</p>',
			'<div class="table-wrap"><table>' +
				'<thead><tr><th class="align-left">Bereich</th><th class="align-center">Wert</th><th class="align-right">Trend</th></tr></thead>' +
				'<tbody>' +
				'<tr><td class="align-left">Schlaf</td><td class="align-center"><strong>gut</strong></td><td class="align-right">↑</td></tr>' +
				'<tr><td class="align-left">Arbeit</td><td class="align-center">&lt;b&gt;x&lt;/b&gt;</td><td class="align-right"></td></tr>' +
				'<tr><td class="align-left">Arbeit | Freizeit</td><td class="align-center">3</td><td class="align-right">–</td></tr>' +
				'</tbody></table></div>',
			'<p>Nachher</p>'
		].join('\n')
	);
});

test('tables: without edge pipes and without rows; no table without a matching separator row', () => {
	assert.equal(
		renderMarkdown('A | B\n--- | ---'),
		'<div class="table-wrap"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody></tbody></table></div>'
	);
	assert.equal(renderMarkdown('Text mit | Strich\n---'), '<p>Text mit | Strich</p>\n<hr>', 'column count does not match: horizontal rule');
	assert.equal(renderMarkdown('a | b\nc | d'), '<p>a | b<br>c | d</p>', 'without a separator row');
});
