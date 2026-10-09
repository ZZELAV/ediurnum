<script lang="ts">
	import { t } from '$lib/i18n/t';
	import { SECTIONS } from '$lib/templates';
	import type { EntryContent } from '$lib/types';

	let { content }: { content: EntryContent } = $props();

	function show(v: unknown): boolean {
		if (typeof v === 'string') return v.trim().length > 0;
		if (Array.isArray(v)) return v.some((x) => String(x).trim());
		return typeof v === 'number';
	}

	const sections = $derived(
		SECTIONS.map((def) => ({ def, values: content.sections[def.kind] })).filter(
			({ def, values }) => values && def.fields.some((f) => show(values[f.id]))
		)
	);
	const empty = $derived(!content.mood && sections.length === 0 && !content.free.trim());
</script>

<!-- Lese-Ansicht eines Eintrags (vergangene Tage, Versionsverlauf) -->
<div class="entry-read">
	{#if content.mood}
		<p class="mood">
			<span class="dot m{content.mood}" aria-hidden="true"></span>
			<span class="faint">{t('entry.mood')}</span>
			<strong>{t(`mood.${content.mood}`)}</strong>
		</p>
	{/if}

	{#each sections as { def, values } (def.kind)}
		<section class="sec">
			<h3>{t(`section.${def.kind}.title`)}</h3>
			{#each def.fields as f (f.id)}
				{@const v = values![f.id]}
				{#if show(v)}
					<div class="qa">
						<p class="q">{t(`section.${def.kind}.${f.id}`)}</p>
						{#if f.type === 'lines'}
							<ul class="lines">
								{#each (v as string[]).filter((x) => x.trim()) as line, i (i)}<li>{line}</li>{/each}
							</ul>
						{:else if f.type === 'chips'}
							<p class="chips">
								{#each v as string[] as x (x)}<span class="chip dusk">{t(`emotion.${x}`)}</span>{/each}
							</p>
						{:else if f.type === 'scale'}
							<p class="a">{t(`energy.${v}`)}</p>
						{:else}
							<p class="a pre">{v}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</section>
	{/each}

	{#if content.free.trim()}
		<section class="sec">
			<h3>{t('entry.free')}</h3>
			<p class="a pre">{content.free}</p>
		</section>
	{/if}

	{#if empty}<p class="faint">—</p>{/if}
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
		align-items: center;
		gap: 0.45rem;
	}
	.mood strong {
		font-weight: 600;
	}
	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: var(--paper-edge);
	}
	.m1 { background: #8a7ca8; }
	.m2 { background: #6f8fb0; }
	.m3 { background: #9a9a8a; }
	.m4 { background: #7aa37f; }
	.m5 { background: #c9a24e; }
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
</style>
