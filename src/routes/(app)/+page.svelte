<script lang="ts">
	import { onMount } from 'svelte';
	import { fmtDate, t } from '$lib/i18n/t';
	import { dismiss, isDismissed } from '$lib/suggest';
	import MoodChart from '$lib/components/MoodChart.svelte';
	import WelcomeCard from '$lib/components/WelcomeCard.svelte';
	import type { SectionKind } from '$lib/types';

	let { data } = $props();

	// „Heute nicht“ gilt auch hier (gleich wie im Eintrag)
	let dismissed = $state<Partial<Record<SectionKind, boolean>>>({});
	onMount(() => {
		for (const k of ['gefuehl', 'wachstum'] as const) if (isDismissed(data.today, k)) dismissed[k] = true;
	});
	function later(kind: SectionKind) {
		dismissed[kind] = true;
		dismiss(data.today, kind);
	}
	const written = (kind: SectionKind) => data.todayMeta?.kinds.includes(kind) ?? false;
	const showGefuehl = $derived(data.suggestions.gefuehl.suggested && !dismissed.gefuehl && !written('gefuehl'));
	const showWachstum = $derived(data.suggestions.wachstum.suggested && !dismissed.wachstum && !written('wachstum'));

	const greeting = $derived(
		data.hour < 5 ? 'greeting.night' : data.hour < 11 ? 'greeting.morning' : data.hour < 18 ? 'greeting.day' : 'greeting.evening'
	);
	const s = $derived(data.suggestions);
</script>

<svelte:head><title>{t('nav.today')} · ediurnum</title></svelte:head>

<div class="view">
	<header class="view-head">
		<div>
			<p class="eyebrow">{fmtDate(data.today, 'long')}</p>
			<h1 class="greet">{data.name ? t('greeting.named', { greeting: t(greeting), name: data.name }) : t(greeting)}.</h1>
		</div>
		<p class="faint">{t('dashboard.stats', { count: data.total })}</p>
	</header>

	<div class="split">
		<div class="stack">
			{#if data.welcome}<WelcomeCard steps={data.welcome} today={data.today} />{/if}

			<section class="card today">
				<div>
					<h2>{t('dashboard.todayEntry')}</h2>
					{#if data.todayMeta}
						<p class="muted">
							{t('dashboard.written')}
							{#each data.todayMeta.kinds as k (k)}<span class="chip">{t(`section.${k}.title`)}</span> {/each}
						</p>
					{:else}
						<p class="muted">{t('dashboard.notYet')}</p>
					{/if}
				</div>
				<a class="btn" href="/entry/{data.today}">{data.todayMeta ? t('dashboard.continue') : t('dashboard.write')}</a>
			</section>

			{#if showGefuehl || showWachstum || data.onThisDay.length}
				<section class="card">
					<h2>{t('dashboard.suggestions')}</h2>
					<ul class="suggest">
						{#if showGefuehl}
							<li>
								<p>
									<span class="chip dusk">{t('entry.suggest.weekly')}</span>
									{s.gefuehl.daysSince === null ? t('dashboard.suggestGefuehlNever') : t('dashboard.suggestGefuehl', { days: s.gefuehl.daysSince })}
								</p>
								<div class="row">
									<a class="btn small" href="/entry/{data.today}?add=gefuehl">{t('entry.suggest.start')}</a>
									<button type="button" class="btn quiet small" onclick={() => later('gefuehl')}>{t('entry.suggest.later')}</button>
								</div>
							</li>
						{/if}
						{#if showWachstum}
							<li>
								<p><span class="chip gold">{t('entry.suggest.monthly')}</span> {t('dashboard.suggestWachstum')}</p>
								<div class="row">
									<a class="btn small" href="/entry/{data.today}?add=wachstum">{t('entry.suggest.start')}</a>
									<button type="button" class="btn quiet small" onclick={() => later('wachstum')}>{t('entry.suggest.later')}</button>
								</div>
							</li>
						{/if}
						{#each data.onThisDay as o (o.id)}
							<li class="memory">
								<a href="/entry/{o.date}">
									<span class="eyebrow">
										{o.years === 1 ? t('dashboard.yearAgo') : t('dashboard.yearsAgo', { years: o.years })} · {fmtDate(o.date, 'medium')}
									</span>
									<span class="memory-text">
										<span class="mood m{o.mood ?? 0}" aria-hidden="true"></span>
										{#if o.locked && !o.snippet}🔒 <em class="faint">{t('archive.lockedHint')}</em>{:else}{o.snippet || '—'}{/if}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="card">
				<div class="card-title">
					<h2>{t('dashboard.recent')}</h2>
					<a class="faint" href="/archive">{t('nav.archive')} →</a>
				</div>
				{#if data.recent.length}
					<ul class="recent">
						{#each data.recent as r (r.id)}
							<li>
								<a href="/entry/{r.date}">
									<span class="mood m{r.mood ?? 0}" aria-hidden="true"></span>
									<span class="when">{fmtDate(r.date, 'weekday')}</span>
									<span class="snip">
										{#if r.locked && !r.snippet}🔒 <em class="faint">{t('archive.lockedHint')}</em>{:else}{r.snippet || '—'}{/if}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted">{t('dashboard.recentEmpty')}</p>
				{/if}
			</section>
		</div>

		<aside class="stack side">
			<section class="card focus">
				<h2>{t('dashboard.focus')}</h2>
				{#if data.focus && data.focus.points.length}
					<ol>
						{#each data.focus.points as p (p)}<li>{p}</li>{/each}
					</ol>
					{#if data.focusMood}
						<MoodChart points={data.focusMood.points} from={data.focusMood.from} to={data.focusMood.to} compact />
					{/if}
					<p class="faint"><a href="/insights#a-{data.focus.id}">{t('dashboard.focusFrom', { date: fmtDate(data.focus.createdAt, 'medium') })}</a></p>
				{:else}
					<p class="muted">{t('dashboard.focusEmpty')}</p>
				{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	.greet {
		font-style: italic;
	}
	.view-head .faint {
		margin: 0;
	}
	.today {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-left: 3px solid var(--accent);
	}
	.today h2 {
		margin-bottom: 0.3rem;
	}
	.today p {
		margin: 0;
	}
	.today .chip {
		margin-left: 0.2rem;
	}
	.suggest {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}
	.suggest li + li {
		padding-top: 0.6rem;
		border-top: 1px solid var(--rule);
	}
	.suggest p {
		margin: 0 0 0.5rem;
	}
	.suggest .chip {
		margin-right: 0.35rem;
	}
	.memory a {
		display: grid;
		gap: 0.25rem;
		color: var(--ink);
		text-decoration: none;
		border-radius: 6px;
	}
	.memory a:hover .memory-text {
		color: var(--accent-strong);
	}
	.memory .eyebrow {
		margin: 0;
	}
	.memory-text {
		font-family: var(--font-serif);
	}
	.memory-text .mood {
		display: inline-block;
		margin-right: 0.35rem;
		vertical-align: 0.1em;
	}
	.focus {
		border-left: 3px solid var(--gold);
	}
	.focus ol {
		font-family: var(--font-serif);
		font-size: 1.02rem;
		padding-left: 1.2rem;
		line-height: 1.6;
	}
	.focus li {
		margin-bottom: 0.5rem;
	}
	.recent {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.recent a {
		display: grid;
		grid-template-columns: auto 5rem minmax(0, 1fr);
		gap: 0.7rem;
		align-items: baseline;
		padding: 0.6rem 0.4rem;
		border-bottom: 1px solid var(--rule);
		text-decoration: none;
		color: var(--ink);
		border-radius: 6px;
	}
	.recent li:last-child a {
		border-bottom: 0;
	}
	.recent a:hover {
		background: var(--paper-2);
	}
	.when {
		color: var(--ink-faint);
		font-size: 0.85rem;
	}
	.snip {
		font-family: var(--font-serif);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mood {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--paper-edge);
	}
	.m1 { background: var(--mood-1); }
	.m2 { background: var(--mood-2); }
	.m3 { background: var(--mood-3); }
	.m4 { background: var(--mood-4); }
	.m5 { background: var(--mood-5); }
</style>
