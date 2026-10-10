<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { currentLang, fmtDate, t } from '$lib/i18n/t';
	import { locale } from '$lib/i18n';
	import PinDialog from '$lib/components/PinDialog.svelte';

	let { data } = $props();

	// Suche: sucht beim Tippen (kurz verzögert) und hält den Begriff in der Adresse (?q=…)
	let query = $state(untrack(() => data.search?.query ?? ''));
	let pinDialog = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function search(value: string, delay = 250) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const q = value.trim();
			goto(q ? `?q=${encodeURIComponent(q)}` : '?', { keepFocus: true, noScroll: true, replaceState: true });
		}, delay);
	}

	function clear() {
		query = '';
		search('', 0);
	}

	function monthTitle(month: string) {
		return new Intl.DateTimeFormat(locale(currentLang()), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
			new Date(month + '-01T00:00:00Z')
		);
	}

	/** Kalenderraster (Montag zuerst) mit leeren Zellen am Anfang. */
	function grid(month: string) {
		const first = new Date(month + '-01T00:00:00Z');
		const offset = (first.getUTCDay() + 6) % 7;
		const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
		const cells: (string | null)[] = Array.from({ length: offset }, () => null);
		for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
		return cells;
	}

	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) =>
			new Intl.DateTimeFormat(locale(currentLang()), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)))
		)
	);
</script>

<svelte:head><title>{t('archive.title')} · ediurnum</title></svelte:head>

<PinDialog bind:open={pinDialog} />

<div class="view">
	<header class="view-head">
		<div>
			<p class="eyebrow">{t('archive.intro')}</p>
			<h1>{t('archive.title')}</h1>
		</div>
	</header>

		{#if data.months.length === 0}
			<div class="card">
			<p class="muted">{t('archive.empty')}</p>
			<a class="btn" href="/entry/{data.today}">{t('dashboard.write')}</a>
			</div>
		{:else}
			<form class="search" role="search" onsubmit={(e) => (e.preventDefault(), search(query, 0))}>
				<label for="q" class="visually-hidden">{t('search.label')}</label>
				<input
					id="q"
					type="search"
					name="q"
					autocomplete="off"
					placeholder={t('search.placeholder')}
					bind:value={query}
					oninput={() => search(query)}
					onkeydown={(e) => e.key === 'Escape' && query && (e.preventDefault(), clear())}
				/>
			</form>
		{/if}

		{#if data.search}
			<section class="card results" aria-live="polite">
				<p class="faint count">
					{data.search.results.length
						? t('search.count', { count: data.search.results.length })
						: t('search.none', { query: data.search.query })}
				</p>
				{#if data.search.skippedLocked > 0}
					<p class="faint">
						{t('search.lockedSkipped', { count: data.search.skippedLocked })}
						<button type="button" class="btn quiet small" onclick={() => (pinDialog = true)}>{t('pin.title')}</button>
					</p>
				{/if}
				<ul>
					{#each data.search.results as r (r.date)}
						<li>
							<a href="/entry/{r.date}">
								<span class="when">
									<span class="dot m{r.mood ?? 0}" aria-hidden="true"></span>
									{fmtDate(r.date, 'long')}
									{#if r.locked}<span aria-label={t('archive.lockedHint')}>🔒</span>{/if}
								</span>
								<span class="where faint">{t(r.field)}</span>
								<span class="snippet">{#each r.parts as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
							</a>
						</li>
					{/each}
				</ul>
				<button type="button" class="btn ghost small" onclick={clear}>{t('search.clear')}</button>
			</section>
		{:else if data.months.length > 0}
			<!-- Legende: Farben der Tage = Stimmung -->
			<ul class="legend faint" aria-label={t('archive.legend')}>
				{#each [1, 2, 3, 4, 5] as m (m)}
					<li><span class="swatch m{m}" aria-hidden="true"></span>{t(`mood.${m}`)}</li>
				{/each}
				<li><span class="swatch m0" aria-hidden="true"></span>{t('archive.legendNoMood')}</li>
				<li><span aria-hidden="true">🔒</span>{t('archive.lockedHint')}</li>
			</ul>
		{/if}

		{#if !data.search}
		<div class="grid-cards">
			{#each data.months as m (m.month)}
				{@const byDate = new Map(m.days.map((d) => [d.date, d]))}
				<section class="card chapter">
					<header>
						<div>
							<h2>{monthTitle(m.month)}</h2>
							<p class="faint">{t('archive.entries', { count: m.days.length })}</p>
						</div>
					</header>
					<div class="cal" role="grid">
						{#each weekdays as w, i (i)}<span class="wd" aria-hidden="true">{w}</span>{/each}
						{#each grid(m.month) as cell, i (i)}
							{#if cell === null}
								<span></span>
							{:else}
								{@const d = byDate.get(cell)}
								{#if d}
									<a
										href="/entry/{cell}"
										class="day has m{d.mood ?? 0}"
										title="{fmtDate(cell, 'long')}{d.snippet ? ' – ' + d.snippet : ''}"
									>
										{Number(cell.slice(8))}
										{#if d.locked}<span class="lock" aria-label={t('archive.lockedHint')}>🔒</span>{/if}
									</a>
								{:else if cell <= data.today}
									<a href="/entry/{cell}" class="day">{Number(cell.slice(8))}</a>
								{:else}
									<span class="day future">{Number(cell.slice(8))}</span>
								{/if}
							{/if}
						{/each}
					</div>
				</section>
			{/each}
		</div>
		{/if}
	</div>

<style>
	.search {
		margin-bottom: 1rem;
		max-width: 32rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		font-size: 0.8rem;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 4px;
		box-shadow: inset 0 0 0 1.5px var(--paper-edge);
	}
	.results {
		max-width: 48rem;
	}
	.results .count {
		margin: 0 0 0.6rem;
	}
	.results ul {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
	}
	.results li + li {
		border-top: 1px solid var(--rule);
	}
	.results a {
		display: grid;
		gap: 0.15rem;
		padding: 0.7rem 0.4rem;
		color: inherit;
		text-decoration: none;
		border-radius: 8px;
	}
	.results a:hover {
		background: var(--paper-2);
	}
	.when {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
	}
	.where {
		font-size: 0.78rem;
	}
	.snippet {
		font-family: var(--font-serif);
		overflow-wrap: anywhere;
	}
	mark {
		background: color-mix(in srgb, var(--gold) 35%, transparent);
		color: inherit;
		border-radius: 3px;
		padding: 0 0.1em;
	}
	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--ink-faint);
		flex: none;
	}
	.dot.m1 { background: var(--mood-1); }
	.dot.m2 { background: var(--mood-2); }
	.dot.m3 { background: var(--mood-3); }
	.dot.m4 { background: var(--mood-4); }
	.dot.m5 { background: var(--mood-5); }
	.chapter header {
		display: flex;
		gap: 0.8rem;
		align-items: baseline;
		border-bottom: 1px solid var(--rule);
		margin-bottom: 0.8rem;
	}
	.chapter h2 {
		margin: 0;
		text-transform: capitalize;
	}
	.chapter .faint {
		margin: 0 0 0.4rem;
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.wd {
		text-align: center;
		font-size: 0.7rem;
		color: var(--ink-faint);
	}
	.day {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		border-radius: 8px;
		font-size: 0.82rem;
		color: var(--ink-faint);
		text-decoration: none;
	}
	a.day:hover {
		background: var(--paper-2);
		color: var(--ink);
	}
	/* Eintrag ohne Stimmung: nur umrandet, damit er sich von allen Stimmungsfarben abhebt */
	.day.has {
		color: var(--ink);
		font-weight: 600;
		box-shadow: inset 0 0 0 1.5px var(--paper-edge);
	}
	:is(.day, .swatch).m1 { background: var(--mood-1-soft); }
	:is(.day, .swatch).m2 { background: var(--mood-2-soft); }
	:is(.day, .swatch).m3 { background: var(--mood-3-soft); }
	:is(.day, .swatch).m4 { background: var(--mood-4-soft); }
	:is(.day, .swatch).m5 { background: var(--mood-5-soft); }
	.day.future {
		opacity: 0.35;
	}
	.lock {
		position: absolute;
		top: -2px;
		right: 0;
		font-size: 0.6rem;
	}
</style>
