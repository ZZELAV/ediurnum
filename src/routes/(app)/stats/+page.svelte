<script lang="ts">
	import MoodChart from '#lib/components/MoodChart.svelte';
	import PinDialog from '#lib/components/PinDialog.svelte';
	import { fmtDate, fmtMonth, fmtNumber, t, weekdayName } from '#lib/i18n/t.ts';
	import { STATS_PERIODS, type Average } from '#lib/stats.ts';

	let { data } = $props();
	const s = $derived(data.stats);
	let pinDialog = $state(false);

	// newest month on the left: the year below the first month and below every December (where the previous year starts)
	const showYear = (month: string, i: number) => i === 0 || month.endsWith('-12');

	/** Height or width of a bar in percent: scale 1–5 so differences show; "1" stays visible as a line. */
	const pct = (a: Average) => (a.avg === null ? 0 : Math.max(3, ((a.avg - 1) / 4) * 100));
	const value = (a: Average) => (a.avg === null ? t('stats.none') : fmtNumber(a.avg));

	const pleasant = $derived(s.emotions.filter((e) => e.pleasant));
	const difficult = $derived(s.emotions.filter((e) => !e.pleasant));
	const maxEmotion = $derived(Math.max(1, ...s.emotions.map((e) => e.count)));
</script>

<svelte:head><title>{t('stats.title')} · ediurnum</title></svelte:head>

<PinDialog bind:open={pinDialog} />

{#snippet emotionList(title: string, list: typeof s.emotions)}
	<div class="emotion-group">
		<h3>{title}</h3>
		{#if list.length === 0}
			<p class="faint">{t('stats.none')}</p>
		{:else}
			<ul class="hbars">
				{#each list as e (e.id)}
					<li>
						<span class="label">{t(`emotion.${e.id}`)}</span>
						<span class="track"><span class="bar" class:difficult={!e.pleasant} style:width="{(e.count / maxEmotion) * 100}%"></span></span>
						<span class="num">{t('stats.weeks', { count: e.count })}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

{#snippet progress(label: string, done: number, total: number)}
	<div class="progress">
		<div class="progress-head">
			<span>{label}</span>
			<span class="faint">{t('stats.reviewsOf', { done, total })}</span>
		</div>
		<span class="track"><span class="bar" style:width="{total ? (done / total) * 100 : 0}%"></span></span>
	</div>
{/snippet}

<div class="view narrow">
	<header class="view-head">
		<div>
			<h1>{t('stats.title')}</h1>
			<p class="muted intro">{t('stats.intro')}</p>
		</div>
	</header>

	{#if data.summary.entries === 0}
		<section class="card"><p class="muted">{t('stats.empty')}</p></section>
	{:else}
		<nav class="pills periods" aria-label={t('stats.period')}>
			{#each STATS_PERIODS as p (p)}
				<a class="pill" class:on={data.period === p} href="?period={p}" aria-current={data.period === p ? 'page' : undefined} data-sveltekit-noscroll data-sveltekit-replacestate>
					{t(`stats.period.${p}`)}
				</a>
			{/each}
			<span class="faint range">{t('stats.range', { from: fmtDate(s.from, 'short'), to: fmtDate(s.to, 'short') })}</span>
		</nav>

		{#if s.hidden > 0}
			<p class="notice info hidden-note">
				{t('stats.hidden', { count: s.hidden })}
				<button type="button" class="btn quiet small" onclick={() => (pinDialog = true)}>{t('stats.unlock')}</button>
			</p>
		{/if}

		<div class="stack">
			<!-- Key figures -->
			<section class="tiles">
				<div class="card tile">
					<span class="eyebrow">{t('stats.streak')}</span>
					<strong>{t('stats.days', { count: data.summary.streak })}</strong>
				</div>
				<div class="card tile">
					<span class="eyebrow">{t('stats.longest')}</span>
					<strong>{t('stats.days', { count: s.longest?.length ?? 0 })}</strong>
					{#if s.longest && s.longest.length > 1}
						<span class="faint">{t('stats.range', { from: fmtDate(s.longest.from, 'short'), to: fmtDate(s.longest.to, 'short') })}</span>
					{/if}
				</div>
				<div class="card tile">
					<span class="eyebrow">{t('stats.written')}</span>
					<strong>{s.written}</strong>
					<span class="faint">{t('stats.writtenOf', { written: s.written, days: s.days })}</span>
				</div>
				<div class="card tile">
					<span class="eyebrow">{t('stats.mood')}</span>
					<strong>{value(s.mood)}{#if s.mood.avg !== null}<small>· {t(`mood.${Math.round(s.mood.avg)}`)}</small>{/if}</strong>
					<span class="faint">{t('stats.moodCount', { count: s.mood.count })}</span>
				</div>
				<div class="card tile">
					<span class="eyebrow">{t('stats.energy')}</span>
					<strong>{value(s.energy)}{#if s.energy.avg !== null}<small>· {t(`energy.${Math.round(s.energy.avg)}`)}</small>{/if}</strong>
					<span class="faint">{t('stats.energyCount', { count: s.energy.count })}</span>
				</div>
			</section>

			<!-- Mood over the period -->
			<section class="card">
				<div class="card-title"><h2>{t('mood.chartTitle')}</h2></div>
				<MoodChart points={s.moodTrend.points} weekly={s.moodTrend.weekly} from={s.from} to={s.to} />
			</section>

			<!-- Mood and energy per month, newest on the left -->
			<section class="card">
				<div class="card-title"><h2>{t('stats.byMonth')}</h2></div>
				<p class="legend faint">
					<span><i class="dot mood"></i>{t('stats.legend.mood')}</span>
					<span><i class="dot energy"></i>{t('stats.legend.energy')}</span>
				</p>
				<div class="months" role="img" aria-label={t('stats.byMonth')}>
					{#each s.byMonth as m, i (m.month)}
						<div class="month" title="{fmtMonth(m.month)}: {t('stats.legend.mood')} {value(m.mood)}, {t('stats.legend.energy')} {value(m.energy)} · {t('stats.monthEntries', { count: m.written })}">
							<div class="cols">
								<span class="col mood" style:height="{pct(m.mood)}%"></span>
								<span class="col energy" style:height="{pct(m.energy)}%"></span>
							</div>
							<span class="month-label">{fmtMonth(m.month, 'short')}</span>
							<span class="year">{showYear(m.month, i) ? m.month.slice(0, 4) : ''}</span>
						</div>
					{/each}
				</div>
				<!-- in a div: a table wouldn't respect the width of 1 px and would make the page overflow sideways -->
				<div class="visually-hidden"><table>
					<caption>{t('stats.byMonth')}</caption>
					<tbody>
						{#each s.byMonth as m (m.month)}
							<tr>
								<td>{fmtMonth(m.month)}</td>
								<td>{t('stats.legend.mood')} {value(m.mood)}</td>
								<td>{t('stats.legend.energy')} {value(m.energy)}</td>
								<td>{t('stats.monthEntries', { count: m.written })}</td>
							</tr>
						{/each}
					</tbody>
				</table></div>
			</section>

			<!-- Mood per weekday -->
			<section class="card">
				<div class="card-title"><h2>{t('stats.byWeekday')}</h2></div>
				<p class="faint">{t('stats.byWeekdayHint')}</p>
				<ul class="hbars">
					{#each s.byWeekday as w (w.weekday)}
						<li title={w.avg === null ? t('stats.noMood') : t('stats.moodCount', { count: w.count })}>
							<span class="label">{weekdayName(w.weekday, 'short')}</span>
							<span class="track"><span class="bar" style:width="{pct(w)}%"></span></span>
							<span class="num">{value(w)}</span>
						</li>
					{/each}
				</ul>
			</section>

			<!-- Most frequent feelings -->
			<section class="card">
				<div class="card-title"><h2>{t('stats.emotions')}</h2></div>
				{#if s.emotions.length === 0}
					<p class="muted">{t('stats.emotionsEmpty')}</p>
				{:else}
					<p class="faint">{t('stats.emotionsHint')}</p>
					<div class="emotions">
						{@render emotionList(t('stats.pleasant'), pleasant)}
						{@render emotionList(t('stats.difficult'), difficult)}
					</div>
				{/if}
			</section>

			<!-- Reviews -->
			<section class="card">
				<div class="card-title"><h2>{t('stats.reviews')}</h2></div>
				{@render progress(t('stats.weekly'), s.weeklyReviews.done, s.weeklyReviews.total)}
				{@render progress(t('stats.monthly'), s.monthlyReviews.done, s.monthlyReviews.total)}
			</section>
		</div>
	{/if}
</div>

<style>
	.intro {
		margin: 0.25rem 0 0;
	}
	.periods {
		align-items: center;
		margin-bottom: 1rem;
	}
	.range {
		margin-left: auto;
	}
	.hidden-note .btn {
		margin-left: 0.25rem;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
		gap: 0.75rem;
	}
	.tile {
		/* narrow tiles: wrap long words instead of sticking out */
		overflow-wrap: anywhere;
		hyphens: auto;
		display: grid;
		align-content: start;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
	}
	.tile .eyebrow {
		margin: 0;
	}
	.tile strong {
		font-size: 1.35rem;
		font-weight: 600;
	}
	.tile small {
		margin-left: 0.3rem;
		font-size: 0.85rem;
		font-weight: 400;
		color: var(--ink-soft);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		margin: -0.25rem 0 1rem;
	}
	.dot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 3px;
		margin-right: 0.3rem;
	}
	.mood {
		background: var(--accent);
	}
	.energy {
		background: var(--dusk);
	}

	/* months: columns, scrollable sideways when there are many months */
	.months {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}
	.month {
		flex: 1 0 2rem;
		display: grid;
		justify-items: center;
		gap: 0.2rem;
	}
	.cols {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 3px;
		width: 100%;
		height: 140px;
		border-bottom: 1px solid var(--rule);
	}
	.col {
		width: min(0.9rem, 40%);
		border-radius: 4px 4px 0 0;
	}
	.month-label {
		font-size: 0.75rem;
		color: var(--ink-soft);
	}
	.year {
		font-size: 0.7rem;
		color: var(--ink-faint);
		min-height: 1em;
	}

	/* horizontal bars (weekdays, feelings) */
	.hbars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}
	.hbars li {
		display: grid;
		grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.9rem;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.num {
		color: var(--ink-faint);
		font-size: 0.82rem;
		text-align: right;
		min-width: 2.5rem;
	}
	.track {
		display: block;
		height: 0.6rem;
		border-radius: 999px;
		background: var(--paper-2);
		overflow: hidden;
	}
	.bar {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
	}
	.bar.difficult {
		background: var(--dusk);
	}

	.emotions {
		display: grid;
		gap: 1.25rem;
	}
	.emotion-group h3 {
		font-size: 0.95rem;
		margin: 0 0 0.5rem;
	}

	.progress {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 0.9rem;
	}
	.progress:last-child {
		margin-bottom: 0;
	}
	.progress-head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.92rem;
	}
</style>
