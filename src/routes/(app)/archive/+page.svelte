<script lang="ts">
	import type { Snapshot } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { api } from '#lib/client.ts';
	import { weekdayOf } from '#lib/dates.ts';
	import { emptyFilter, matchesFilter, type DayFilter } from '#lib/filter.ts';
	import { currentLocale, fmtDate, fmtMonth, t } from '#lib/i18n/t.ts';
	import PinDialog from '#lib/components/PinDialog.svelte';
	import type { SearchHit } from '#lib/search.ts';
	import { EMOTIONS } from '#lib/templates.ts';

	let { data } = $props();

	// filter for the calendar and search results – only in the browser. Kept when coming back from an entry.
	let filter = $state<DayFilter>(emptyFilter());
	export const snapshot: Snapshot<DayFilter> = {
		capture: () => $state.snapshot(filter),
		// a snapshot from before an update may lack newer groups
		restore: (v) => (filter = { ...emptyFilter(), ...v })
	};

	// choice as a dropdown below the button; closes on a click outside and with Escape
	let filterOpen = $state(false);
	let filterMenu = $state<HTMLElement>();
	function closeOnOutside(e: Event) {
		if (filterOpen && !filterMenu?.contains(e.target as Node)) filterOpen = false;
	}
	function closeOnEscape(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !filterOpen) return;
		filterOpen = false;
		filterMenu?.querySelector('button')?.focus();
	}

	const filtering = $derived(filter.moods.length + filter.energies.length + filter.kinds.length + filter.emotions.length);
	const days = $derived(new Map(data.months.flatMap((m) => m.days.map((d) => [d.date, d]))));
	const passes = (date: string) => !filtering || matchesFilter(days.get(date)!, filter);
	const matched = $derived([...days.keys()].filter(passes).length);
	// locked entries without the PIN: mood, energy and feelings unknown, they only match reviews
	const unreadable = $derived(
		filter.moods.length || filter.energies.length || filter.emotions.length ? [...days.values()].filter((d) => !d.readable).length : 0
	);

	function toggle(list: (string | number)[], value: string | number) {
		const i = list.indexOf(value);
		if (i === -1) list.push(value);
		else list.splice(i, 1);
	}

	function resetFilter() {
		filter = emptyFilter();
	}

	// search while typing (slightly delayed). The term goes to the server via POST and never appears in the
	// address – otherwise it would end up in the browser history and in the logs of the reverse proxy.
	type Result = { date: string; mood: number | null; locked: boolean } & SearchHit;
	let query = $state('');
	let search = $state<{ query: string; results: Result[]; skippedLocked: number } | null>(null);
	let failed = $state(false);
	let pinDialog = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let latest = 0;

	function runSearch(value: string, delay = 250) {
		clearTimeout(timer);
		const q = value.trim();
		if (!q) {
			latest++;
			search = null;
			failed = false;
			return;
		}
		timer = setTimeout(async () => {
			const id = ++latest;
			const res = await api<{ results: Result[]; skippedLocked: number }>('/api/search', 'POST', { query: q });
			if (id !== latest) return;
			failed = !res.ok;
			if (res.ok) search = { query: q, ...res.data };
		}, delay);
	}

	// PIN expired or „Wieder sperren“ (lock again): fetch the results again, so no excerpts of locked entries remain
	let pinUntil: number | undefined;
	$effect(() => {
		const until = data.pinUnlockedUntil;
		if (pinUntil !== undefined && until !== pinUntil) untrack(() => search && runSearch(query, 0));
		pinUntil = until;
	});

	function clear() {
		query = '';
		runSearch('');
	}

	/** Calendar grid (Monday first) with empty cells at the start. */
	function grid(month: string) {
		const first = new Date(month + '-01T00:00:00Z');
		const offset = (weekdayOf(month + '-01') + 6) % 7;
		const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
		const cells: (string | null)[] = Array.from({ length: offset }, () => null);
		for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
		return cells;
	}

	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) =>
			new Intl.DateTimeFormat(currentLocale(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)))
		)
	);
</script>

<svelte:head><title>{t('archive.title')} · ediurnum</title></svelte:head>
<svelte:window onpointerdown={closeOnOutside} onkeydown={closeOnEscape} />

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
			<div class="tools">
				<form class="search" role="search" onsubmit={(e) => (e.preventDefault(), runSearch(query, 0))}>
					<label for="q" class="visually-hidden">{t('search.label')}</label>
					<input
						id="q"
						type="search"
						autocomplete="off"
						placeholder={t('search.placeholder')}
						bind:value={query}
						oninput={() => runSearch(query)}
						onkeydown={(e) => e.key === 'Escape' && query && (e.preventDefault(), clear())}
					/>
				</form>
				<div class="filter-menu" bind:this={filterMenu}>
					<button
						type="button"
						class="btn ghost"
						aria-expanded={filterOpen}
						aria-controls="archive-filter"
						onclick={() => (filterOpen = !filterOpen)}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 7h16M7 12h10M10 17h4" />
						</svg>
						{t('archive.filter')}
						{#if filtering}<span class="badge">{filtering}</span>{/if}
					</button>
					{#if filterOpen}
						<section id="archive-filter" class="card filter" aria-label={t('archive.filter')}>
							<div>
								<p class="faint group">{t('entry.mood')}</p>
								<div class="pills">
									{#each [1, 2, 3, 4, 5] as m (m)}
										{@const on = filter.moods.includes(m)}
										<button type="button" class="pill" class:on aria-pressed={on} onclick={() => toggle(filter.moods, m)}>
											<span class="swatch m{m}" aria-hidden="true"></span>{t(`mood.${m}`)}
										</button>
									{/each}
								</div>
							</div>
							<div>
								<p class="faint group">{t('archive.filterEnergy')}</p>
								<div class="pills">
									{#each [1, 2, 3, 4, 5] as n (n)}
										{@const on = filter.energies.includes(n)}
										<button type="button" class="pill" class:on aria-pressed={on} onclick={() => toggle(filter.energies, n)}>
											<span class="swatch m{n}" aria-hidden="true"></span>{t(`energy.${n}`)}
										</button>
									{/each}
								</div>
							</div>
							<div>
								<p class="faint group">{t('stats.reviews')}</p>
								<div class="pills">
									{#each [['feelings', 'weekly'], ['growth', 'monthly']] as const as [kind, label] (kind)}
										{@const on = filter.kinds.includes(kind)}
										<button type="button" class="pill" class:on aria-pressed={on} onclick={() => toggle(filter.kinds, kind)}>
											{t(`entry.suggest.${label}`)}
										</button>
									{/each}
								</div>
							</div>
							<div>
								<p class="faint group">{t('archive.filterEmotions')}</p>
								<div class="pills">
									{#each EMOTIONS as e (e)}
										{@const on = filter.emotions.includes(e)}
										<button type="button" class="pill" class:on aria-pressed={on} onclick={() => toggle(filter.emotions, e)}>
											{t(`emotion.${e}`)}
										</button>
									{/each}
								</div>
							</div>
							{#if filtering}
								<button type="button" class="btn ghost small reset" onclick={resetFilter}>{t('archive.filterReset')}</button>
							{/if}
						</section>
					{/if}
				</div>
			</div>
			{#if failed}<p class="notice error" role="alert">{t('common.error')}</p>{/if}

			{#if filtering}
				<div class="filter-info faint" aria-live="polite">
					{#if !search}<p>{t('archive.filterCount', { count: matched })}</p>{/if}
					{#if unreadable}
						<p>
							{t('archive.filterHidden', { count: unreadable })}
							<button type="button" class="btn quiet small" onclick={() => (pinDialog = true)}>{t('pin.title')}</button>
						</p>
					{/if}
				</div>
			{/if}
		{/if}

		{#if search}
			{@const results = search.results.filter((r) => passes(r.date))}
			<section class="card results" aria-live="polite">
				<p class="faint count">
					{results.length
						? t('search.count', { count: results.length })
						: t('search.none', { query: search.query })}
				</p>
				{#if search.skippedLocked > 0}
					<p class="faint">
						{t('search.lockedSkipped', { count: search.skippedLocked })}
						<button type="button" class="btn quiet small" onclick={() => (pinDialog = true)}>{t('pin.title')}</button>
					</p>
				{/if}
				<ul>
					{#each results as r (r.date)}
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
			<!-- legend: colours of the days = mood -->
			<ul class="legend faint" aria-label={t('archive.legend')}>
				{#each [1, 2, 3, 4, 5] as m (m)}
					<li><span class="swatch m{m}" aria-hidden="true"></span>{t(`mood.${m}`)}</li>
				{/each}
				<li><span class="swatch m0" aria-hidden="true"></span>{t('archive.legendNoMood')}</li>
				<li><span aria-hidden="true">🔒</span>{t('archive.lockedHint')}</li>
			</ul>
		{/if}

		{#if !search}
		<div class="grid-cards">
			{#each data.months as m (m.month)}
				{@const byDate = new Map(m.days.map((d) => [d.date, d]))}
				<section class="card chapter">
					<header>
						<div>
							<h2>{fmtMonth(m.month)}</h2>
							<p class="faint">
								{filtering
									? t('archive.entriesOf', { count: m.days.length, matched: m.days.filter((d) => passes(d.date)).length })
									: t('archive.entries', { count: m.days.length })}
							</p>
						</div>
					</header>
					<div class="cal">
						{#each weekdays as w, i (i)}<span class="wd" aria-hidden="true">{w}</span>{/each}
						{#each grid(m.month) as cell, i (i)}
							{#if cell === null}
								<span></span>
							{:else}
								{@const d = byDate.get(cell)}
								<!-- days that don't match the filter look like days without an entry -->
								{#if d && passes(cell)}
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
	.tools {
		display: flex;
		gap: 0.5rem;
		max-width: 38rem;
		margin-bottom: 1rem;
	}
	.search {
		flex: 1 1 0;
		min-width: 0;
	}
	.badge {
		min-width: 1.3rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--paper);
		font-size: 0.75rem;
		line-height: 1.3rem;
		text-align: center;
	}
	/* flex, so the button stretches to the height of the search field */
	.filter-menu {
		position: relative;
		display: flex;
	}
	/* dropdown right-aligned below the button; on phones at most as wide as the screen */
	.filter {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 20;
		width: min(28rem, calc(100vw - 2rem));
		/* scrolls when there is little height; room for the header, search and (phone) the navigation bar at the bottom */
		max-height: min(34rem, calc(100dvh - 17rem));
		overflow-y: auto;
		display: grid;
		gap: 1rem;
	}
	.filter .group {
		margin: 0 0 0.4rem;
		font-size: 0.85rem;
	}
	.filter .pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.filter .reset {
		justify-self: start;
	}
	.filter-info p {
		margin: 0 0 1rem;
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
	/* entry without a mood: only outlined, so it stands out from all mood colours */
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
