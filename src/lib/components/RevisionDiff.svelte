<script lang="ts">
	import { t } from '#lib/i18n/t.ts';
	import { SECTIONS } from '#lib/templates.ts';
	import { diffWords, hasChanges, type DiffPart } from '#lib/diff.ts';
	import type { EntryContent, FieldValue } from '#lib/types.ts';

	/** Zeigt eine Version mit den Änderungen gegenüber der Version davor (`before`). */
	let { before, after }: { before: EntryContent; after: EntryContent } = $props();

	type Field =
		| { id: string; label: string; type: 'text'; parts: DiffPart[]; changed: boolean }
		| { id: string; label: string; type: 'lines'; lines: DiffPart[][]; changed: boolean }
		| { id: string; label: string; type: 'chips'; chips: { text: string; kind: DiffPart['kind'] }[]; changed: boolean }
		| { id: string; label: string; type: 'value'; from: string | null; to: string | null; changed: boolean };

	const str = (v: FieldValue | undefined) => (typeof v === 'string' ? v : '');
	const arr = (v: FieldValue | undefined) => (Array.isArray(v) ? v : []);
	const textField = (id: string, label: string, b: string, a: string): Field => {
		const parts = diffWords(b.trim(), a.trim());
		return { id, label, type: 'text', parts, changed: hasChanges(parts) };
	};

	const sections = $derived(
		SECTIONS.map((def) => {
			const b = before.sections[def.kind] ?? {};
			const a = after.sections[def.kind] ?? {};
			const fields: Field[] = [];
			for (const f of def.fields) {
				const label = t(`section.${def.kind}.${f.id}`);
				if (f.type === 'text' || f.type === 'textarea') {
					const field = textField(f.id, label, str(b[f.id]), str(a[f.id]));
					if (field.type === 'text' && field.parts.length) fields.push(field);
				} else if (f.type === 'lines') {
					const bl = arr(b[f.id]);
					const al = arr(a[f.id]);
					const lines = Array.from({ length: Math.max(bl.length, al.length) }, (_, i) =>
						diffWords((bl[i] ?? '').trim(), (al[i] ?? '').trim())
					).filter((l) => l.length);
					if (lines.length) fields.push({ id: f.id, label, type: 'lines', lines, changed: lines.some(hasChanges) });
				} else if (f.type === 'chips') {
					const bc = arr(b[f.id]);
					const ac = arr(a[f.id]);
					const all = [...new Set([...bc, ...ac])];
					const chips = all.map((x) => ({
						text: t(`emotion.${x}`),
						kind: (bc.includes(x) && ac.includes(x) ? 'same' : ac.includes(x) ? 'add' : 'del') as DiffPart['kind']
					}));
					if (chips.length) fields.push({ id: f.id, label, type: 'chips', chips, changed: chips.some((c) => c.kind !== 'same') });
				} else if (f.type === 'scale') {
					const from = typeof b[f.id] === 'number' ? t(`energy.${b[f.id]}`) : null;
					const to = typeof a[f.id] === 'number' ? t(`energy.${a[f.id]}`) : null;
					if (from || to) fields.push({ id: f.id, label, type: 'value', from, to, changed: from !== to });
				}
			}
			return { kind: def.kind, title: t(`section.${def.kind}.title`), fields };
		}).filter((s) => s.fields.length)
	);

	const mood = $derived({
		from: before.mood ? t(`mood.${before.mood}`) : null,
		to: after.mood ? t(`mood.${after.mood}`) : null
	});
	const free = $derived(textField('free', t('entry.free'), before.free, after.free));
	const unchanged = $derived(
		mood.from === mood.to && !free.changed && sections.every((s) => s.fields.every((f) => !f.changed))
	);
</script>

{#snippet text(parts: DiffPart[])}{#each parts as p, i (i)}{#if p.kind === 'add'}<ins>{p.text}</ins>{:else if p.kind === 'del'}<del>{p.text}</del>{:else}{p.text}{/if}{/each}{/snippet}

{#snippet value(from: string | null, to: string | null)}
	{#if from === to}{to}{:else}{#if from}<del>{from}</del>{/if}{#if from && to}<span class="arrow" aria-hidden="true"> → </span>{/if}{#if to}<ins>{to}</ins>{/if}{/if}
{/snippet}

<!-- Vergleichsansicht im Versionsverlauf: Hinzugefügtes markiert, Entferntes durchgestrichen -->
<div class="entry-read">
	{#if unchanged}<p class="faint">{t('history.noChanges')}</p>{/if}

	{#if mood.from || mood.to}
		<p class="mood" class:same={mood.from === mood.to}>
			<span class="faint">{t('entry.mood')}</span>
			<strong>{@render value(mood.from, mood.to)}</strong>
		</p>
	{/if}

	{#each sections as s (s.kind)}
		<section class="sec">
			<h3>{s.title}</h3>
			{#each s.fields as f (f.id)}
				<div class="qa" class:same={!f.changed}>
					<p class="q">{f.label}</p>
					{#if f.type === 'lines'}
						<ul class="lines">
							{#each f.lines as line, i (i)}<li>{@render text(line)}</li>{/each}
						</ul>
					{:else if f.type === 'chips'}
						<p class="chips">
							{#each f.chips as c (c.text)}
								<span class="chip dusk" class:add={c.kind === 'add'} class:del={c.kind === 'del'}>{c.text}</span>
							{/each}
						</p>
					{:else if f.type === 'value'}
						<p class="a">{@render value(f.from, f.to)}</p>
					{:else}
						<p class="a pre">{@render text(f.parts)}</p>
					{/if}
				</div>
			{/each}
		</section>
	{/each}

	{#if free.type === 'text' && free.parts.length}
		<section class="sec" class:same={!free.changed}>
			<h3>{t('entry.free')}</h3>
			<p class="a pre">{@render text(free.parts)}</p>
		</section>
	{/if}
</div>

<style>
	.entry-read {
		display: grid;
		gap: 1.1rem;
	}
	p {
		margin: 0;
	}
	.mood {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
	}
	.mood strong {
		font-weight: 600;
	}
	.sec {
		display: grid;
		gap: 0.75rem;
		padding-top: 1.1rem;
		border-top: 1px solid var(--rule);
	}
	h3 {
		margin: 0;
		font-size: 1.08rem;
	}
	.qa {
		display: grid;
		gap: 0.15rem;
	}
	/* Unverändertes tritt zurück, damit die Änderungen auffallen */
	.same {
		opacity: 0.5;
	}
	.q {
		font-size: 0.8rem;
		color: var(--ink-faint);
	}
	.a,
	.lines {
		font-family: var(--font-serif);
		font-size: 1.02rem;
		line-height: 1.6;
	}
	.pre {
		white-space: pre-wrap;
	}
	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.lines li {
		position: relative;
		padding-left: 1rem;
	}
	.lines li::before {
		content: '';
		position: absolute;
		left: 0.15rem;
		top: 0.72em;
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: var(--accent);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.15rem;
	}
	ins,
	.chip.add {
		background: color-mix(in srgb, var(--mood-4) 30%, transparent);
		text-decoration: none;
		border-radius: 3px;
	}
	del,
	.chip.del {
		color: var(--danger);
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		text-decoration: line-through;
		border-radius: 3px;
	}
	.arrow {
		color: var(--ink-faint);
	}
</style>
