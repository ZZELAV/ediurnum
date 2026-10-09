<script lang="ts">
	import { autosize } from '$lib/actions';
	import { t } from '$lib/i18n/t';
	import { sectionDef } from '$lib/templates';
	import type { FieldValue, SectionKind } from '$lib/types';
	import Scale from './Scale.svelte';

	let {
		kind,
		values = $bindable(),
		onremove
	}: { kind: SectionKind; values: Record<string, FieldValue>; onremove?: () => void } = $props();

	const def = $derived(sectionDef(kind));

	// Fehlende Felder mit passenden Startwerten belegen
	$effect.pre(() => {
		for (const f of def.fields) {
			if (values[f.id] !== undefined) continue;
			if (f.type === 'lines') values[f.id] = Array.from({ length: f.count ?? 3 }, () => '');
			else if (f.type === 'chips') values[f.id] = [];
			else if (f.type === 'scale') values[f.id] = null;
			else values[f.id] = '';
		}
	});

	function toggleChip(fieldId: string, option: string) {
		const arr = (values[fieldId] as string[]) ?? [];
		values[fieldId] = arr.includes(option) ? arr.filter((x) => x !== option) : [...arr, option];
	}
</script>

<section class="section card" aria-labelledby="sec-{kind}">
	<header>
		<div>
			<p class="eyebrow">{t(`entry.rhythm.${def.rhythm}`)}</p>
			<h2 id="sec-{kind}">{t(`section.${kind}.title`)}</h2>
			<p class="faint intro">{t(`section.${kind}.intro`)}</p>
		</div>
		{#if onremove}
			<button type="button" class="btn quiet small" onclick={onremove} title={t('entry.remove')} aria-label={t('entry.remove')}>✕</button>
		{/if}
	</header>

	{#each def.fields as f (f.id)}
		{@const id = `${kind}-${f.id}`}
		<div class="field">
			{#if f.type === 'lines'}
				<p class="question" id="{id}-label">{t(`section.${kind}.${f.id}`)}</p>
				<ol class="lines" aria-labelledby="{id}-label">
					{#each Array.from({ length: f.count ?? 3 }) as _, i (i)}
						<li>
							<span class="num" aria-hidden="true">{i + 1}</span>
							<input
								type="text"
								class="write"
								aria-label="{t(`section.${kind}.${f.id}`)} {i + 1}"
								placeholder={i === 0 ? t(`section.${kind}.${f.id}.hint`) : ''}
								bind:value={(values[f.id] as string[])[i]}
							/>
						</li>
					{/each}
				</ol>
			{:else if f.type === 'text'}
				<label class="question" for={id}>{t(`section.${kind}.${f.id}`)}</label>
				<input id={id} type="text" class="write" placeholder={t(`section.${kind}.${f.id}.hint`)} bind:value={values[f.id] as string} />
			{:else if f.type === 'textarea'}
				<label class="question" for={id}>{t(`section.${kind}.${f.id}`)}</label>
				<textarea id={id} class="write" rows="2" placeholder={t(`section.${kind}.${f.id}.hint`)} bind:value={values[f.id] as string} use:autosize></textarea>
			{:else if f.type === 'scale'}
				<p class="question">{t(`section.${kind}.${f.id}`)}</p>
				<Scale bind:value={values[f.id] as number | null} labelPrefix="energy" name={t(`section.${kind}.${f.id}`)} />
			{:else if f.type === 'chips'}
				<p class="question">{t(`section.${kind}.${f.id}`)}</p>
				<div class="chips">
					{#each f.options ?? [] as opt (opt)}
						{@const on = ((values[f.id] as string[]) ?? []).includes(opt)}
						<button type="button" class="chip-btn" class:on aria-pressed={on} onclick={() => toggleChip(f.id, opt)}>
							{t(`emotion.${opt}`)}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</section>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	h2 {
		margin-bottom: 0.1rem;
	}
	.intro {
		margin: 0;
	}
	.lines {
		list-style: none;
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
	}
	.lines li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.lines input {
		flex: 1 1 0;
		min-width: 0;
	}
	.num {
		flex: none;
		width: 1.2rem;
		text-align: right;
		font-family: var(--font-serif);
		color: var(--ink-faint);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.chip-btn {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.3rem 0.8rem;
		border-radius: 999px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-2);
		color: var(--ink-soft);
		cursor: pointer;
	}
	.chip-btn:hover {
		border-color: var(--accent);
	}
	.chip-btn.on {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-strong);
	}
</style>
