<script lang="ts">
	import { fmtDate, t } from '$lib/i18n/t';

	let { data } = $props();

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
			<h1 class="greet">{t(greeting)}.</h1>
		</div>
		<p class="faint">{t('dashboard.stats', { count: data.total })}</p>
	</header>

	<div class="split">
		<div class="stack">
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

			{#if s.gefuehl.suggested || s.wachstum.suggested}
				<section class="card">
					<h2>{t('dashboard.suggestions')}</h2>
					<ul class="suggest">
						{#if s.gefuehl.suggested}
							<li>
								<span class="chip dusk">{t('section.gefuehl.title')}</span>
								{s.gefuehl.daysSince === null ? t('dashboard.suggestGefuehlNever') : t('dashboard.suggestGefuehl', { days: s.gefuehl.daysSince })}
							</li>
						{/if}
						{#if s.wachstum.suggested}
							<li><span class="chip gold">{t('section.wachstum.title')}</span> {t('dashboard.suggestWachstum')}</li>
						{/if}
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
										{#if r.locked}🔒 <em class="faint">{t('archive.lockedHint')}</em>{:else}{r.snippet || '—'}{/if}
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
	.suggest .chip {
		margin-right: 0.35rem;
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
		grid-template-columns: auto 5rem 1fr;
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
	.m1 { background: #8a7ca8; }
	.m2 { background: #6f8fb0; }
	.m3 { background: #9a9a8a; }
	.m4 { background: #7aa37f; }
	.m5 { background: #c9a24e; }
</style>
