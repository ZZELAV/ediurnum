<script lang="ts">
	import { untrack } from 'svelte';
	import { ask } from '$lib/confirm.svelte';
	import { enhance } from '$app/forms';
	import { api } from '$lib/client';
	import { addDays } from '$lib/dates';
	import PinDialog from '$lib/components/PinDialog.svelte';
	import MoodChart from '$lib/components/MoodChart.svelte';
	import { fmtDate, fmtDateTime, t } from '$lib/i18n/t';

	let { data } = $props();

	let period = $state<'7' | '30' | '90' | 'custom'>('30');
	const startDay = untrack(() => data.today);
	let customFrom = $state(addDays(startDay, -30));
	let customTo = $state(startDay);
	let question = $state('');
	let tone = $state<'gentle' | 'balanced' | 'direct'>('balanced');
	let focusCount = $state(4);
	let pinDialog = $state(false);
	let preview = $state<{ send: number; locked: number; pinOpen: boolean; excluded: number } | null>(null);

	// Schritt 1: erstellte Markdown-Datei; Schritt 2: Antwort aus dem Chat
	let result = $state<{
		markdown: string;
		moods: { date: string; mood: number }[];
		count: number;
		from: string;
		to: string;
		filename: string;
	} | null>(null);
	let withProfile = $state(true);
	let answer = $state('');
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let busy = $state(false);

	const from = $derived(period === 'custom' ? customFrom : addDays(data.today, -Number(period)));
	const to = $derived(period === 'custom' ? customTo : data.today);

	$effect(() => {
		const f = from;
		const tt = to;
		void data.pinUnlockedUntil;
		let cancelled = false;
		api<typeof preview>(`/api/ai/preview?from=${f}&to=${tt}`, 'GET').then((res) => {
			if (!cancelled && res.ok) preview = res.data;
		});
		return () => (cancelled = true);
	});

	const periods = ['7', '30', '90', 'custom'] as const;
	const tones = ['gentle', 'balanced', 'direct'] as const;

	function download() {
		if (!result) return;
		const url = URL.createObjectURL(new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }));
		const a = Object.assign(document.createElement('a'), { href: url, download: result.filename });
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function copy() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.markdown);
			notice = t('insights.copied');
		} catch {
			notice = t('insights.copyFailed');
		}
	}
</script>

<svelte:head><title>{t('insights.title')} · ediurnum</title></svelte:head>

<PinDialog bind:open={pinDialog} />

<div class="view narrow">
	<header class="view-head">
		<div>
			<h1>{t('insights.title')}</h1>
			<p class="muted intro">{t('insights.intro')}</p>
		</div>
	</header>

<div class="stack">
	<section class="card">
		<h2>{t('insights.new')}</h2>

		<!-- Schritt 1: Markdown-Datei erstellen -->
		<form
			method="POST"
			action="?/prompt"
			use:enhance={() => {
				busy = true;
				error = notice = null;
				return async ({ result: r }) => {
					busy = false;
					if (r.type === 'success' && r.data) {
						result = r.data as typeof result;
						answer = '';
					} else if (r.type === 'failure') {
						error = String(r.data?.error ?? 'common.error');
					} else {
						error = 'common.error';
					}
				};
			}}
		>
			<p class="step">1 · {t('insights.step1')}</p>
			<fieldset class="field">
				<legend>{t('insights.period')}</legend>
				<div class="periods">
					{#each periods as p (p)}
						<label class="pill" class:on={period === p}>
							<input type="radio" name="period" value={p} bind:group={period} />
							{t(`insights.period.${p}`)}
						</label>
					{/each}
				</div>
				{#if period === 'custom'}
					<div class="dates">
						<div>
							<label for="from">{t('insights.from')}</label>
							<input id="from" type="date" bind:value={customFrom} max={data.today} />
						</div>
						<div>
							<label for="to">{t('insights.to')}</label>
							<input id="to" type="date" bind:value={customTo} max={data.today} />
						</div>
					</div>
				{/if}
				<input type="hidden" name="from" value={from} />
				<input type="hidden" name="to" value={to} />
			</fieldset>

			<div class="dates">
				<div class="field">
					<label for="tone">{t('insights.tone')}</label>
					<select id="tone" name="tone" bind:value={tone}>
						{#each tones as x (x)}<option value={x}>{t(`settings.aiTone.${x}`)}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="fc">{t('insights.focusCount')}</label>
					<select id="fc" name="focusCount" bind:value={focusCount}>
						{#each [1, 2, 3, 4, 5, 6, 7] as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</div>
			</div>

			<div class="field">
				<label for="q">{t('insights.question')} <span class="faint">({t('common.optional')})</span></label>
				<textarea id="q" name="question" rows="2" placeholder={t('insights.questionHint')} bind:value={question}></textarea>
			</div>

			<div class="field check">
				<label class="switch-label">
					<input type="checkbox" role="switch" name="profile" bind:checked={withProfile} />
					<span>{t('insights.withProfile')}</span>
				</label>
				<p class="faint">
					{data.hasProfile ? t('insights.withProfileHint') : t('insights.withProfileEmpty')}
					<a href="/profile">{t('profile.title')} →</a>
				</p>
			</div>

			{#if preview}
				<div class="preview card">
					<p>{t('insights.preview', { count: preview.send })}</p>
					{#if preview.locked > 0 && preview.pinOpen}
						<p class="faint">{t('insights.previewLocked', { count: preview.locked })}</p>
					{:else if preview.locked > 0}
						<p class="faint">
							{t('insights.previewLockedNeedPin', { count: preview.locked })}
							<button type="button" class="btn quiet small" onclick={() => (pinDialog = true)}>{t('pin.title')}</button>
						</p>
					{/if}
					{#if preview.excluded > 0}<p class="faint">{t('insights.previewExcluded', { count: preview.excluded })}</p>{/if}
					<p class="faint privacy">{t('insights.privacy')}</p>
				</div>
			{/if}

			{#if error && !result}<p class="notice error" role="alert">{t(error)}</p>{/if}

			<button class="btn" disabled={busy || preview?.send === 0}>{busy ? t('common.loading') : t('insights.createFile')}</button>
		</form>

		{#if result}
			<!-- Datei bereit: herunterladen oder kopieren -->
			<div class="ready">
				<p><strong>{t('insights.fileReady', { count: result.count })}</strong></p>
				<MoodChart points={result.moods} from={result.from} to={result.to} />
				<div class="row">
					<button type="button" class="btn" onclick={download}>{t('insights.download')}</button>
					<button type="button" class="btn ghost" onclick={copy}>{t('insights.copy')}</button>
				</div>
				{#if notice}<p class="faint" role="status">{notice}</p>{/if}
				<p class="faint">{t('insights.howTo')}</p>
			</div>

			<!-- Schritt 2 (optional): Antwort der KI speichern -->
			<form
				method="POST"
				action="?/import"
				use:enhance={() => {
					busy = true;
					error = notice = null;
					return async ({ result: r, update }) => {
						busy = false;
						if (r.type === 'success') {
							const n = Number((r.data as { focusCount?: number })?.focusCount ?? 0);
							notice = n > 0 ? t('insights.savedWithFocus', { count: n }) : t('insights.savedNoFocus');
							result = null;
							answer = '';
							await update({ reset: false });
						} else if (r.type === 'failure') {
							error = String(r.data?.error ?? 'common.error');
						}
					};
				}}
			>
				<p class="step">2 · {t('insights.step2')} <span class="faint">({t('common.optional')})</span></p>
				<input type="hidden" name="from" value={result.from} />
				<input type="hidden" name="to" value={result.to} />
				<input type="hidden" name="count" value={result.count} />
				<input type="hidden" name="question" value={question} />
				<div class="field">
					<label for="answer" class="visually-hidden">{t('insights.answer')}</label>
					<textarea id="answer" name="answer" rows="6" placeholder={t('insights.answerHint')} bind:value={answer}></textarea>
				</div>
				{#if error}<p class="notice error" role="alert">{t(error)}</p>{/if}
				<button class="btn ghost" disabled={busy || !answer.trim()}>{t('insights.saveAnswer')}</button>
			</form>
		{:else if notice}
			<p class="notice" role="status">{notice}</p>
		{/if}
	</section>

	<section class="stack">
		<h2 class="history-title">{t('insights.history')}</h2>
		{#if data.analyses.length === 0}
			<p class="muted">{t('insights.historyEmpty')}</p>
		{/if}
		{#each data.analyses as a, i (a.id)}
			<details class="card analysis" id="a-{a.id}" open={i === 0}>
				<summary>
					<span class="title">{fmtDateTime(a.createdAt)}</span>
					{#if a.pinned}<span class="chip gold">{t('insights.pinned')}</span>{/if}
					<span class="faint meta">
						{a.provider === 'chat'
							? t('insights.metaChat', { from: fmtDate(a.from, 'short'), to: fmtDate(a.to, 'short'), count: a.entryCount })
							: t('insights.meta', { from: fmtDate(a.from, 'short'), to: fmtDate(a.to, 'short'), count: a.entryCount, agent: a.agentName, model: a.model })}
					</span>
				</summary>
				{#if a.question}<p class="faint"><em>„{a.question}“</em></p>{/if}
				<MoodChart points={a.moods} from={a.from} to={a.to} />
				{#if a.focusPoints.length}
					<div class="focus card">
						<p class="eyebrow">{t('insights.focusPoints')}</p>
						<ol>{#each a.focusPoints as p (p)}<li>{p}</li>{/each}</ol>
					</div>
				{/if}
				<div class="prose">{@html a.html}</div>
				<div class="row actions">
					<form method="POST" action="?/pin" use:enhance>
						<input type="hidden" name="id" value={a.pinned ? '' : a.id} />
						<button class="btn ghost small">{a.pinned ? t('insights.unpin') : t('insights.pin')}</button>
					</form>
					<form
						method="POST"
						action="?/delete"
						use:enhance={async ({ cancel }) => {
							if (!(await ask(t('common.confirmDelete'), { confirmLabel: t('common.delete'), danger: true }))) cancel();
						}}
					>
						<input type="hidden" name="id" value={a.id} />
						<button class="btn danger small">{t('insights.delete')}</button>
					</form>
				</div>
			</details>
		{/each}
	</section>
</div>
</div>

<style>
	.intro {
		margin: 0.3rem 0 0;
		max-width: 60ch;
	}
	.history-title {
		margin: 0;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 1.4rem;
	}
	legend {
		font-size: 0.9rem;
		color: var(--ink-soft);
		margin-bottom: 0.4rem;
	}
	.periods {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pill {
		margin: 0;
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-2);
		cursor: pointer;
		font-size: 0.86rem;
		color: var(--ink-soft);
	}
	.pill input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.pill.on {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-strong);
	}
	.pill:has(input:focus-visible) {
		outline: 2px solid var(--dusk);
	}
	.dates {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
		margin-top: 0.8rem;
	}
	.preview {
		margin-bottom: 1rem;
		font-size: 0.92rem;
	}
	.preview p {
		margin: 0 0 0.3rem;
	}
	.privacy {
		margin-top: 0.5rem !important;
	}
	.step {
		font-weight: 600;
		margin: 0 0 0.8rem;
	}
	.ready {
		margin: 1.4rem 0;
		padding: 1rem;
		border-radius: 12px;
		background: var(--accent-soft);
	}
	.ready p {
		margin: 0 0 0.6rem;
	}
	.ready p:last-child {
		margin: 0.6rem 0 0;
	}
	.analysis {
		padding-block: 1rem;
	}
	summary {
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.7rem;
	}
	summary .title {
		font-family: var(--font-serif);
		font-size: 1.1rem;
	}
	summary .meta {
		flex-basis: 100%;
	}
	.focus {
		margin: 1rem 0;
		border-left: 3px solid var(--gold);
	}
	.focus ol {
		margin: 0;
		padding-left: 1.2rem;
		font-family: var(--font-serif);
	}
	.actions {
		margin-top: 1rem;
	}
	.check p {
		margin: 0.2rem 0 0 calc(2.4rem + 0.55rem);
	}
	.switch-label {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--ink);
		margin: 0;
	}
</style>
