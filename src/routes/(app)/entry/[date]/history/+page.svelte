<script lang="ts">
	import { goto } from '$app/navigation';
	import { ask } from '#lib/confirm.svelte.ts';
	import { api } from '#lib/client.ts';
	import EntryView from '#lib/components/EntryView.svelte';
	import RevisionDiff from '#lib/components/RevisionDiff.svelte';
	import PinDialog from '#lib/components/PinDialog.svelte';
	import { fmtDate, fmtDateTime, t } from '#lib/i18n/t.ts';

	let { data } = $props();
	let selected = $state(0);
	let pinDialog = $state(false);
	let error = $state<string | null>(null);

	const rev = $derived(data.revisions[selected]);
	// comparison with the version before (the list is sorted from new to old)
	const older = $derived(data.revisions[selected + 1]);
	let highlight = $state(true);

	async function restore() {
		if (!(await ask(t('history.restoreConfirm')))) return;
		const res = await api(`/api/entry/${data.date}/restore`, 'POST', { revision: rev.revision });
		if (res.ok) await goto(`/entry/${data.date}`, { refreshAll: true });
		else error = res.error;
	}
</script>

<svelte:head><title>{t('history.title')} · {fmtDate(data.date, 'medium')}</title></svelte:head>

<PinDialog bind:open={pinDialog} />

<div class="view">
	<header class="view-head">
		<div>
			<a class="btn quiet small back" href="/entry/{data.date}">← {t('history.backToEntry')}</a>
			<p class="eyebrow">{t('history.title')}</p>
			<h1>{fmtDate(data.date, 'medium')}</h1>
		</div>
	</header>

	<div class="split">
		<aside class="card side">
			<p class="faint">{t('history.intro')}</p>
			<ol class="revs">
				{#each data.revisions as r, i (r.revision)}
					<li>
						<button type="button" class:active={i === selected} onclick={() => (selected = i)}>
							<strong>{t('entry.revision', { n: r.revision })}</strong>
							<span class="faint">{i === 0 ? t('history.current') : fmtDateTime(r.createdAt)}</span>
						</button>
					</li>
				{/each}
			</ol>
		</aside>
		<section class="card">
			{#if error}<p class="notice error">{t(error)}</p>{/if}
			{#if rev}
				<div class="row head">
					<h2>{t('entry.revision', { n: rev.revision })}</h2>
					{#if selected > 0 && rev.content}
						<button class="btn ghost small" onclick={restore}>{t('history.restore')}</button>
					{/if}
				</div>
				{#if rev.content && older?.content}
					<label class="switch-label compare">
						<input type="checkbox" role="switch" bind:checked={highlight} />
						<span>{t('history.highlight', { n: older.revision })}</span>
					</label>
				{/if}
				{#if rev.content && older?.content && highlight}
					<RevisionDiff before={older.content} after={rev.content} />
				{:else if rev.content}
					<EntryView content={rev.content} />
				{:else}
					<p class="muted">{t('entry.lockedInfo')}</p>
					<button class="btn" onclick={() => (pinDialog = true)}>{t('pin.title')}</button>
				{/if}
			{/if}
		</section>
	</div>
</div>

<style>
	.back {
		margin: -0.5rem 0 1rem -0.5rem;
	}
	.revs {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: grid;
		gap: 0.3rem;
	}
	.revs button {
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font: inherit;
		text-align: left;
		padding: 0.55rem 0.8rem;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.revs button:hover {
		background: var(--paper-2);
	}
	.revs button.active {
		background: var(--accent-soft);
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.head {
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.head h2 {
		margin: 0;
	}
	.compare {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0 0 1rem;
		font-size: 0.88rem;
		color: var(--ink-soft);
	}
</style>
