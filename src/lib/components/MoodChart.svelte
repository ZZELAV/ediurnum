<script lang="ts">
	import { daysBetween } from '#lib/dates.ts';
	import { fmtDate, fmtNumber, t } from '#lib/i18n/t.ts';

	/**
	 * Stimmungsverlauf (1–5) über einen Zeitraum: Linie mit Punkten, Lücken an Tagen ohne Stimmung.
	 * `weekly`: Punkte sind Wochendurchschnitte (Datum = Wochenbeginn). Der Gesamtdurchschnitt steht
	 * in der Statistik als eigene Kachel und wird hier nicht wiederholt.
	 */
	let {
		points,
		from,
		to,
		weekly = false
	}: { points: { date: string; mood: number }[]; from: string; to: string; weekly?: boolean } = $props();

	// Breite erst nach dem Messen bekannt – vorher nichts zeichnen, sonst ragt die Grafik auf dem Handy kurz hinaus
	let width = $state(0);
	const height = 190;
	const pad = { top: 12, right: 12, bottom: 26, left: 74 };

	const span = $derived(Math.max(1, daysBetween(from, to)));
	const x = (date: string) => pad.left + (daysBetween(from, date) / span) * (width - pad.left - pad.right);
	const y = (mood: number) => pad.top + ((5 - mood) / 4) * (height - pad.top - pad.bottom);

	const sorted = $derived([...points].sort((a, b) => a.date.localeCompare(b.date)));
	// Benachbarte Punkte verbinden; Lücken (mehr als 3 Tage bzw. eine ausgelassene Woche) gestrichelt
	const maxStep = $derived(weekly ? 7 : 3);
	const segments = $derived(
		sorted.slice(1).map((p, i) => ({ a: sorted[i], b: p, gap: daysBetween(sorted[i].date, p.date) > maxStep }))
	);
	/** Wert als Text: Tageswert als Wort, Wochenschnitt als Zahl mit dem nächstliegenden Wort. */
	const label = (mood: number) => (weekly ? `${fmtNumber(mood)} · ${t(`mood.${Math.round(mood)}`)}` : t(`mood.${mood}`));
	const when = (date: string, style: 'dayMonth' | 'medium') => (weekly ? t('mood.week', { date: fmtDate(date, style) }) : fmtDate(date, style));
	const ticks = $derived(from === to ? [from] : [from, to]);

	let hover = $state<{ date: string; mood: number } | null>(null);
</script>

<figure class="mood-chart" bind:clientWidth={width}>
	<!-- sichtbarer Titel steht in der Karte drumherum -->
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
					<strong>{label(hover.mood)}</strong>
					<span>{when(hover.date, 'dayMonth')}</span>
				</div>
			{/if}
			{/if}
		</div>
		<!-- im div: eine Tabelle hielte sich nicht an die Breite von 1 px und liesse die Seite seitlich überlaufen -->
		<div class="visually-hidden">
			<table>
				<caption>{t('mood.chartTitle')}</caption>
				<tbody>
					{#each sorted as p (p.date)}<tr><td>{when(p.date, 'medium')}</td><td>{label(p.mood)}</td></tr>{/each}
				</tbody>
			</table>
		</div>
	{/if}
</figure>

<style>
	.mood-chart {
		margin: 0;
		min-width: 0;
		/* Breite nur vom Platz drumherum, nicht vom gezeichneten SVG – sonst bliebe die Grafik nach dem
		   Schmalerwerden (Handy drehen, Fenster verkleinern) so breit wie zuvor gemessen */
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
