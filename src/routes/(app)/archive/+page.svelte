<script lang="ts">
	import { currentLang, fmtDate, t } from '$lib/i18n/t';
	import { locale } from '$lib/i18n';

	let { data } = $props();

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
		{/if}

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
	</div>

<style>
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
	.day.has {
		color: var(--ink);
		font-weight: 600;
		background: var(--accent-soft);
	}
	.day.m1 { background: color-mix(in srgb, #8a7ca8 30%, transparent); }
	.day.m2 { background: color-mix(in srgb, #6f8fb0 30%, transparent); }
	.day.m3 { background: color-mix(in srgb, #9a9a8a 30%, transparent); }
	.day.m4 { background: color-mix(in srgb, #7aa37f 32%, transparent); }
	.day.m5 { background: color-mix(in srgb, #c9a24e 35%, transparent); }
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
