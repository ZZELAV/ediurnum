<script lang="ts">
	import { daysBetween } from '#lib/dates.ts';
	import { fmtDate, fmtNumber, t } from '#lib/i18n/t.ts';

	/**
	 * Mood over a period (1–5): line with points, newest day on the left,
	 * gaps on days without a mood.
	 * `weekly`: points are weekly averages (date = start of the week). The overall average is shown
	 * as a tile of its own in the statistics and is not repeated here.
	 */
	let {
		points,
		from,
		to,
		weekly = false
	}: { points: { date: string; mood: number }[]; from: string; to: string; weekly?: boolean } = $props();

	// width is only known after measuring – draw nothing before, otherwise the chart briefly overflows on phones
	let width = $state(0);
	const height = 190;
	const pad = { top: 12, right: 12, bottom: 26, left: 74 };

	const span = $derived(Math.max(1, daysBetween(from, to)));
	// newest on the left (like the monthly chart in the statistics), oldest on the right
	const x = (date: string) => pad.left + (daysBetween(date, to) / span) * (width - pad.left - pad.right);
	const y = (mood: number) => pad.top + ((5 - mood) / 4) * (height - pad.top - pad.bottom);

	const sorted = $derived([...points].sort((a, b) => a.date.localeCompare(b.date)));
	// connect neighbouring points; gaps (more than 3 days or a skipped week) are dashed
	const maxStep = $derived(weekly ? 7 : 3);
	const segments = $derived(
		sorted.slice(1).map((p, i) => ({ a: sorted[i], b: p, gap: daysBetween(sorted[i].date, p.date) > maxStep }))
	);
	/** Value as text: a daily value as a word, a weekly average as a number with the nearest word. */
	const label = (mood: number) => (weekly ? `${fmtNumber(mood)} · ${t(`mood.${Math.round(mood)}`)}` : t(`mood.${mood}`));
	const when = (date: string, style: 'dayMonth' | 'medium') => (weekly ? t('mood.week', { date: fmtDate(date, style) }) : fmtDate(date, style));
	const ticks = $derived(from === to ? [to] : [to, from]);

	let hover = $state<{ date: string; mood: number } | null>(null);
</script>

<figure class="mood-chart" bind:clientWidth={width}>
	<!-- the visible title is in the surrounding card -->
	<figcaption class="visually-hidden">{t('mood.chartTitle')}</figcaption>

	{#if sorted.length === 0}
		<p class="faint">{t('mood.chartEmpty')}</p>
	{:else}
		<div class="plot" style:min-height="{height}px">
			{#if width > 0}
			<svg {width} {height} role="img" aria-label={t('mood.chartTitle')}>
				{#each [1, 2, 3, 4, 5] as m (m)}
					<line class="grid" x1={pad.left} x2={width - pad.right} y1={y(m)} y2={y(m)} />
					<text class="axis" x={pad.left - 8} y={y(m)} dy="0.32em" text-anchor="end">{t(`mood.${m}`)}</text>
				{/each}
				{#each ticks as d, i (i)}
					<text class="axis" x={x(d)} y={height - 6} text-anchor={i === 0 ? 'start' : 'end'}>{fmtDate(d, 'short')}</text>
				{/each}
				{#each segments as s (s.a.date)}
					<line class="line" class:gap={s.gap} x1={x(s.a.date)} y1={y(s.a.mood)} x2={x(s.b.date)} y2={y(s.b.mood)} />
				{/each}
				{#each sorted as p (p.date)}
					<circle class="dot" class:on={hover?.date === p.date} cx={x(p.date)} cy={y(p.mood)} r={hover?.date === p.date ? 5.5 : weekly ? 3 : 4} />
					<!-- larger, invisible hit area for mouse and finger -->
					<circle
						class="hit"
						cx={x(p.date)}
						cy={y(p.mood)}
						r="12"
						role="presentation"
						onpointerenter={() => (hover = p)}
						onpointerleave={() => (hover = null)}
					/>
				{/each}
			</svg>
			{#if hover}
				<div
					class="tip"
					style:left="{Math.min(Math.max(x(hover.date), 70), width - 70)}px"
					style:top="{y(hover.mood) - 10}px"
				>
					<strong>{label(hover.mood)}</strong>
					<span>{when(hover.date, 'dayMonth')}</span>
				</div>
			{/if}
			{/if}
		</div>
		<!-- in a div: a table wouldn't respect the width of 1 px and would make the page overflow sideways -->
		<div class="visually-hidden">
			<table>
				<caption>{t('mood.chartTitle')}</caption>
				<tbody>
					{#each sorted.toReversed() as p (p.date)}<tr><td>{when(p.date, 'medium')}</td><td>{label(p.mood)}</td></tr>{/each}
				</tbody>
			</table>
		</div>
	{/if}
</figure>

<style>
	.mood-chart {
		margin: 0;
		min-width: 0;
		/* width only from the surrounding space, not from the drawn SVG – otherwise the chart would stay as wide
		   as measured before after getting narrower (turning the phone, shrinking the window) */
		contain: inline-size;
	}
	.plot {
		position: relative;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--rule);
		stroke-width: 1;
	}
	.axis {
		fill: var(--ink-faint);
		font-size: 11px;
		font-family: var(--font-sans);
	}
	.line {
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linecap: round;
	}
	.line.gap {
		stroke-dasharray: 3 5;
		opacity: 0.6;
	}
	.dot {
		fill: var(--accent);
		stroke: var(--paper);
		stroke-width: 2;
		transition: r 0.1s;
	}
	.hit {
		fill: transparent;
		cursor: default;
	}
	.tip {
		position: absolute;
		transform: translate(-50%, -100%);
		pointer-events: none;
		display: grid;
		gap: 0.1rem;
		padding: 0.35rem 0.6rem;
		border-radius: 8px;
		background: var(--paper);
		border: 1px solid var(--paper-edge);
		box-shadow: var(--shadow);
		font-size: 0.8rem;
		white-space: nowrap;
		color: var(--ink);
	}
	.tip span {
		color: var(--ink-faint);
	}
</style>
