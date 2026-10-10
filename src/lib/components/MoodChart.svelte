<script lang="ts">
	import { daysBetween } from '$lib/dates';
	import { fmtDate, fmtNumber, t } from '$lib/i18n/t';

	/** Stimmungsverlauf (1–5) über einen Zeitraum: Linie mit Punkten, Lücken an Tagen ohne Stimmung. */
	let {
		points,
		from,
		to,
		compact = false
	}: { points: { date: string; mood: number }[]; from: string; to: string; compact?: boolean } = $props();

	// Breite erst nach dem Messen bekannt – vorher nichts zeichnen, sonst ragt die Grafik auf dem Handy kurz hinaus
	let width = $state(0);
	// kompakt (z. B. in der Seitenspalte): niedriger, Beschriftung nur bei 1, 3 und 5
	const height = $derived(compact ? 140 : 190);
	const pad = $derived({ top: 12, right: 12, bottom: 26, left: compact ? 66 : 74 });
	const labelled = $derived(compact ? [1, 3, 5] : [1, 2, 3, 4, 5]);

	const span = $derived(Math.max(1, daysBetween(from, to)));
	const x = (date: string) => pad.left + (daysBetween(from, date) / span) * (width - pad.left - pad.right);
	const y = (mood: number) => pad.top + ((5 - mood) / 4) * (height - pad.top - pad.bottom);

	const sorted = $derived([...points].sort((a, b) => a.date.localeCompare(b.date)));
	// Aufeinanderfolgende Tage verbinden; grössere Lücken (> 3 Tage) gestrichelt
	const segments = $derived(
		sorted.slice(1).map((p, i) => ({ a: sorted[i], b: p, gap: daysBetween(sorted[i].date, p.date) > 3 }))
	);
	const average = $derived(sorted.length ? sorted.reduce((s, p) => s + p.mood, 0) / sorted.length : null);
	const ticks = $derived(from === to ? [from] : [from, to]);

	let hover = $state<{ date: string; mood: number } | null>(null);
</script>

<figure class="mood-chart" bind:clientWidth={width}>
	<figcaption>
		<span class="title">{t('mood.chartTitle')}</span>
		{#if average !== null}
			<span class="faint">{t('mood.chartAverage', { value: fmtNumber(average), count: sorted.length })}</span>
		{/if}
	</figcaption>

	{#if sorted.length === 0}
		<p class="faint">{t('mood.chartEmpty')}</p>
	{:else}
		<div class="plot" style:min-height="{height}px">
			{#if width > 0}
			<svg {width} {height} role="img" aria-label={t('mood.chartTitle')}>
				{#each [1, 2, 3, 4, 5] as m (m)}
					<line class="grid" x1={pad.left} x2={width - pad.right} y1={y(m)} y2={y(m)} />
					{#if labelled.includes(m)}
						<text class="axis" x={pad.left - 8} y={y(m)} dy="0.32em" text-anchor="end">{t(`mood.${m}`)}</text>
					{/if}
				{/each}
				{#each ticks as d, i (i)}
					<text class="axis" x={x(d)} y={height - 6} text-anchor={i === 0 ? 'start' : 'end'}>{fmtDate(d, 'short')}</text>
				{/each}
				{#each segments as s (s.a.date)}
					<line class="line" class:gap={s.gap} x1={x(s.a.date)} y1={y(s.a.mood)} x2={x(s.b.date)} y2={y(s.b.mood)} />
				{/each}
				{#each sorted as p (p.date)}
					<circle class="dot" class:on={hover?.date === p.date} cx={x(p.date)} cy={y(p.mood)} r={hover?.date === p.date ? 5.5 : 4} />
					<!-- grössere, unsichtbare Trefferfläche für Maus und Finger -->
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
					<strong>{t(`mood.${hover.mood}`)}</strong>
					<span>{fmtDate(hover.date, 'dayMonth')}</span>
				</div>
			{/if}
			{/if}
		</div>
		<table class="visually-hidden">
			<caption>{t('mood.chartTitle')}</caption>
			<tbody>
				{#each sorted as p (p.date)}<tr><td>{fmtDate(p.date, 'medium')}</td><td>{p.mood}/5 ({t(`mood.${p.mood}`)})</td></tr>{/each}
			</tbody>
		</table>
	{/if}
</figure>

<style>
	.mood-chart {
		margin: 1rem 0;
		min-width: 0;
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.7rem;
		margin-bottom: 0.4rem;
	}
	.title {
		font-weight: 600;
		font-size: 0.9rem;
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
