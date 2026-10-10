<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { ask } from '$lib/confirm.svelte';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { autosize } from '$lib/actions';
	import { exitFocus, focusMode } from '$lib/focus';
	import { page } from '$app/state';
	import { api } from '$lib/client';
	import { fmtDate, fmtTime, t } from '$lib/i18n/t';
	import { emptyContent, sanitizeContent, SECTIONS, sectionDef } from '$lib/templates';
	import type { Suggestions } from '$lib/reminders';
	import { dismiss, isDismissed } from '$lib/suggest';
	import type { Entry, EntryMeta, SectionKind } from '$lib/types';
	import PinDialog from './PinDialog.svelte';
	import EntryView from './EntryView.svelte';
	import Scale from './Scale.svelte';
	import SectionBlock from './SectionBlock.svelte';

	interface Props {
		date: string;
		today: string;
		entry: Entry | null;
		suggestions: Suggestions;
		focus: { id: string; createdAt: string; points: string[] } | null;
		hasPin: boolean;
		pinOpen: boolean;
		prev: string;
		next: string | null;
	}

	let { date, today, entry, suggestions, focus, hasPin, pinOpen, prev, next }: Props = $props();

	// Der Editor wird pro Tag neu erzeugt ({#key} in der Seite) – Startwerte genügen.
	const initial = untrack(() => entry);
	const readable = initial === null || initial.content !== null;
	let content = $state(sanitizeContent(initial?.content ?? emptyContent()));
	let lastSaved = JSON.stringify(content);
	let meta = $state<EntryMeta | null>(initial ? { ...initial } : null);
	let status = $state<'saved' | 'dirty' | 'saving' | 'error'>('saved');
	let message = $state<string | null>(null);
	let pinDialog = $state(false);
	let afterPin: (() => void) | null = null;

	// Nach invalidateAll (z. B. Sperren) die Metadaten übernehmen
	$effect(() => {
		if (entry) meta = { ...entry };
	});

	const optional = SECTIONS.filter((s) => s.kind !== 'erlebt');
	const visibleKinds = $derived(SECTIONS.map((s) => s.kind).filter((k) => content.sections[k] !== undefined));

	$effect(() => {
		if (!readable) return;
		const current = JSON.stringify(content);
		if (current === lastSaved) return;
		status = 'dirty';
		const timer = setTimeout(save, 1500);
		return () => clearTimeout(timer);
	});

	async function save() {
		const current = JSON.stringify(content);
		if (current === lastSaved || !readable) return;
		status = 'saving';
		const newRevision = startRevision;
		const res = await api<{ meta: EntryMeta | null }>(`/api/entry/${date}`, 'POST', { content: $state.snapshot(content), newRevision });
		if (res.ok) {
			lastSaved = current;
			if (newRevision) startRevision = false;
			if (res.data.meta) meta = res.data.meta;
			status = JSON.stringify(content) === lastSaved ? 'saved' : 'dirty';
			message = null;
		} else {
			status = 'error';
			message = res.error;
		}
	}

	function flushWithBeacon() {
		if (JSON.stringify(content) === lastSaved) return;
		const blob = new Blob([JSON.stringify({ content: $state.snapshot(content), newRevision: startRevision })], {
			type: 'application/json'
		});
		navigator.sendBeacon(`/api/entry/${date}`, blob);
	}

	beforeNavigate(() => {
		if (status === 'dirty' || status === 'saving') save();
	});

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				save();
			}
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pagehide', flushWithBeacon);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pagehide', flushWithBeacon);
		};
	});

	// Vergangene Tage öffnen sich zum Lesen; bearbeitet wird erst nach Klick auf den Stift.
	let editing = $state(untrack(() => date === today));
	// Jede Bearbeitung eines vergangenen Tages beginnt beim ersten Speichern eine neue Version
	let startRevision = false;

	function startEditing() {
		editing = true;
		startRevision = !!meta;
	}

	async function finishEditing() {
		await save();
		exitFocus();
		editing = false;
	}

	// ---- Vorschläge für Rückblicke ----
	// Fällige Rückblicke erscheinen als eigene Karte; „Heute nicht“ wird pro Tag im Browser gemerkt
	// (gleich wie auf der Startseite, siehe $lib/suggest).
	let dismissed = $state<Partial<Record<SectionKind, boolean>>>({});

	onMount(() => {
		for (const s of optional) if (isDismissed(date, s.kind)) dismissed[s.kind] = true;
		// „Jetzt schreiben“ auf der Startseite öffnet den Eintrag mit ?add=<Abschnitt>
		const add = page.url.searchParams.get('add');
		const def = optional.find((s) => s.kind === add);
		if (def && readable && content.sections[def.kind] === undefined) {
			editing = true;
			addSection(def.kind);
		}
	});

	const isSuggested = (kind: SectionKind) =>
		kind === 'gefuehl' ? suggestions.gefuehl.suggested : kind === 'wachstum' ? suggestions.wachstum.suggested : false;
	const missing = $derived(optional.filter((s) => content.sections[s.kind] === undefined));
	const suggestedCards = $derived(missing.filter((s) => isSuggested(s.kind) && !dismissed[s.kind]));
	const quietAdds = $derived(missing.filter((s) => !suggestedCards.includes(s)));

	function suggestionReason(kind: SectionKind): string {
		if (kind === 'wachstum') return t('dashboard.suggestWachstum');
		const days = suggestions.gefuehl.daysSince;
		return days === null ? t('dashboard.suggestGefuehlNever') : t('dashboard.suggestGefuehl', { days });
	}

	function later(kind: SectionKind) {
		dismissed[kind] = true;
		dismiss(date, kind);
	}

	async function addSection(kind: SectionKind) {
		content.sections[kind] = {};
		await tick();
		document.getElementById(`sec-${kind}`)?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function removeSection(kind: SectionKind) {
		const sec = content.sections[kind];
		const filled = sec && Object.values(sec).some((v) => (Array.isArray(v) ? v.some((x) => x.trim()) : v !== null && v !== ''));
		if (filled && !(await ask(t('entry.removeConfirm'), { danger: true }))) return;
		delete content.sections[kind];
	}

	function withPin(action: () => void) {
		if (pinOpen) return action();
		afterPin = action;
		pinDialog = true;
	}

	async function toggleLock() {
		if (!meta) return;
		if (!hasPin) {
			message = 'error.noPin';
			return;
		}
		await save();
		withPin(async () => {
			const res = await api(`/api/entry/${date}/lock`, 'POST', { locked: !meta!.locked });
			if (!res.ok) message = res.error;
			await invalidateAll();
		});
	}

	async function toggleAi(e: Event) {
		const allowed = (e.currentTarget as HTMLInputElement).checked;
		const res = await api(`/api/entry/${date}/ai`, 'POST', { allowed });
		if (res.ok && meta) meta.aiAllowed = allowed;
	}

	async function remove() {
		if (!(await ask(t('entry.deleteConfirm'), { confirmLabel: t('common.delete'), danger: true }))) return;
		const run = async () => {
			const res = await api(`/api/entry/${date}`, 'DELETE');
			if (res.ok) {
				lastSaved = JSON.stringify(content);
				await goto('/', { invalidateAll: true });
			} else {
				message = res.error;
			}
		};
		// Gesperrte Einträge lassen sich nur mit PIN löschen
		if (meta?.locked) withPin(run);
		else run();
	}

	const weekday = $derived(fmtDate(date, 'long').split(',')[0]);
	const dateLine = $derived(fmtDate(date, 'medium'));
</script>

<PinDialog bind:open={pinDialog} onunlocked={() => { afterPin?.(); afterPin = null; }} />

{#snippet pencil()}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
	</svg>
{/snippet}

{#snippet sectionIcon(kind: SectionKind)}
	<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if kind === 'gefuehl'}
			<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
		{:else}
			<path d="M12 21v-9" /><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z" /><path d="M12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z" />
		{/if}
	</svg>
{/snippet}

<div class="view entry-view">
	<button type="button" class="btn quiet small focus-exit" onclick={exitFocus}>{t('focus.exit')}</button>
	<p class="focus-hint" aria-hidden="true">{t('focus.hint')}</p>
	<header class="entry-head">
		<div class="title">
			<p class="eyebrow">{date === today ? t('entry.today') : t('entry.title')}</p>
			<h1>{weekday}<span class="date">, {dateLine}</span></h1>
		</div>
		<nav class="daynav" aria-label={t('entry.title')}>
			{#if readable && date !== today && (meta || editing)}
				{#if editing}
					<button type="button" class="btn small" onclick={finishEditing}>✓ {t('entry.editDone')}</button>
				{:else}
					<button type="button" class="btn ghost small" onclick={startEditing}>{@render pencil()} {t('entry.edit')}</button>
				{/if}
			{/if}
			<a class="btn ghost icon" href="/entry/{prev}" aria-label={t('entry.prevDay')} title={t('entry.prevDay')}>←</a>
			{#if date !== today}
				<a class="btn ghost small" href="/entry/{today}">{t('entry.today')}</a>
			{/if}
			{#if next}
				<a class="btn ghost icon" href="/entry/{next}" aria-label={t('entry.nextDay')} title={t('entry.nextDay')}>→</a>
			{/if}
		</nav>
		{#if status === 'saving' || status === 'error'}
			<p class="status" data-status={status} aria-live="polite">
				{status === 'saving' ? t('common.saving') : t('common.error')}
			</p>
		{/if}
	</header>

	{#if message}
		<p class="notice error" role="alert">
			{t(message)}
			{#if message === 'error.noPin'}<a href="/settings#security">{t('nav.settings')}</a>{/if}
		</p>
	{/if}

	<div class="split">
		<div class="stack main-col" use:focusMode={page.data.focusMode === true}>
			{#if !readable}
				<div class="card locked">
					<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
					<p>{t('entry.lockedInfo')}</p>
					<button class="btn" onclick={() => (pinDialog = true)}>{t('pin.title')}</button>
				</div>
			{:else if !editing}
				<!-- Vergangener Tag: nur lesen, bearbeiten über den Stift -->
				{#if meta}
					<section class="card read">
						{#if meta.locked}<span class="chip gold">🔒 {t('entry.lockedBadge')}</span>{/if}
						<EntryView {content} />
					</section>
				{:else}
					<section class="card empty-day">
						<p class="muted">{t('entry.readEmpty')}</p>
						<button type="button" class="btn ghost" onclick={() => (editing = true)}>{@render pencil()} {t('entry.writeLater')}</button>
					</section>
				{/if}
			{:else}
				<section class="card">
					<div class="card-title">
						<h2 class="question-title">{t('entry.moodQuestion')}</h2>
						{#if meta?.locked}<span class="chip gold">🔒 {t('entry.lockedBadge')}</span>{/if}
					</div>
					<Scale bind:value={content.mood} labelPrefix="mood" name={t('entry.mood')} />
				</section>

				{#each suggestedCards as s (s.kind)}
					<section class="card suggest {s.kind}" aria-labelledby="suggest-{s.kind}">
						<span class="suggest-icon">{@render sectionIcon(s.kind)}</span>
						<div class="suggest-text">
							<p class="eyebrow">{t(`entry.suggest.${sectionDef(s.kind).rhythm}`)}</p>
							<h2 id="suggest-{s.kind}">{t(`section.${s.kind}.title`)}</h2>
							<p class="muted">{suggestionReason(s.kind)}</p>
						</div>
						<div class="row suggest-actions">
							<button type="button" class="btn" onclick={() => addSection(s.kind)}>{t('entry.suggest.start')}</button>
							<button type="button" class="btn quiet small" onclick={() => later(s.kind)}>{t('entry.suggest.later')}</button>
						</div>
					</section>
				{/each}

				{#each visibleKinds as kind (kind)}
					<SectionBlock {kind} bind:values={content.sections[kind]!} onremove={kind === 'erlebt' ? undefined : () => removeSection(kind)} />
				{/each}

				<section class="card">
					<h2><label for="free" class="free-label">{t('entry.free')}</label></h2>
					<textarea id="free" class="write free" rows="5" placeholder={t('entry.freeHint')} bind:value={content.free} use:autosize></textarea>
				</section>

				{#if quietAdds.length}
					<div class="more">
						<p class="eyebrow">{t('entry.add')}</p>
						<div class="row">
							{#each quietAdds as s (s.kind)}
								<button type="button" class="add-pill" onclick={() => addSection(s.kind)}>
									<span aria-hidden="true">+</span>
									{t(`section.${s.kind}.title`)}
									<span class="faint">· {t(`entry.rhythm.${sectionDef(s.kind).rhythm}`)}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<aside class="stack side">
			{#if focus && focus.points.length}
				<section class="card focus">
					<p class="eyebrow">{t('entry.focusReminder')}</p>
					<ul>
						{#each focus.points as p (p)}<li>{p}</li>{/each}
					</ul>
				</section>
			{/if}

			{#if meta}
				<section class="card meta">
					<p class="faint">
						{t('entry.revision', { n: meta.revision })} · {t('entry.lastSaved', { time: fmtTime(meta.updatedAt) })}
					</p>
					<div class="row">
						<a class="btn ghost small" href="/entry/{date}/history">{t('entry.history')}</a>
						<button type="button" class="btn ghost small" onclick={toggleLock}>
							{meta.locked ? t('entry.unlockEntry') : t('entry.lock')}
						</button>
					</div>
					<label class="ai">
						<input type="checkbox" role="switch" checked={meta.aiAllowed} onchange={toggleAi} />
						<span>{t('entry.aiAllowed')}</span>
					</label>
					{#if meta.locked}<p class="faint">{t('entry.aiAllowedLockedHint')}</p>{/if}
					<button type="button" class="btn danger small" onclick={remove}>{t('entry.delete')}</button>
				</section>
			{/if}
		</aside>
	</div>
</div>

<style>
	.entry-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1rem;
		margin-bottom: 1.25rem;
	}
	.title {
		flex: 1 1 auto;
		min-width: 0;
	}
	.title h1 {
		margin: 0;
		font-style: italic;
	}
	.date {
		font-style: normal;
		font-size: 0.6em;
		color: var(--ink-soft);
	}
	.daynav {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}
	.daynav .btn {
		height: 2.25rem;
	}
	.status {
		flex-basis: 100%;
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-faint);
	}
	.status[data-status='error'] {
		color: var(--danger);
	}
	.question-title {
		font-size: 1.08rem;
	}
	.free-label {
		font: inherit;
		color: inherit;
		margin: 0;
	}
	textarea.free {
		min-height: 8rem;
	}
	.focus {
		border-left: 3px solid var(--gold);
	}
	.focus ul {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-serif);
	}
	.focus li {
		margin-bottom: 0.35rem;
	}
	.suggest {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.9rem 1rem;
		align-items: start;
		border-left: 3px solid var(--dusk);
	}
	.suggest.wachstum {
		border-left-color: var(--gold);
	}
	.suggest-icon {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 12px;
		background: var(--dusk-soft);
		color: var(--dusk);
	}
	.suggest.wachstum .suggest-icon {
		background: color-mix(in srgb, var(--gold) 18%, transparent);
		color: color-mix(in srgb, var(--gold) 70%, var(--ink));
	}
	.suggest-text h2 {
		margin: 0 0 0.2rem;
		font-size: 1.15rem;
	}
	.suggest-text p {
		margin: 0;
	}
	.suggest-actions {
		grid-column: 2;
	}
	@media (max-width: 520px) {
		.suggest-actions {
			grid-column: 1 / -1;
		}
	}
	.more {
		padding: 0.25rem 0.25rem 0;
	}
	.add-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font: inherit;
		padding: 0.45rem 0.95rem;
		border-radius: 999px;
		border: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.add-pill:hover {
		background: var(--accent-soft);
	}
	.add-pill .faint {
		font-size: 0.82rem;
	}
	.read .chip {
		margin-bottom: 0.9rem;
	}
	.empty-day {
		display: grid;
		justify-items: start;
		gap: 0.8rem;
	}
	.empty-day p {
		margin: 0;
	}
	.daynav .btn.small {
		gap: 0.35rem;
	}
	.meta {
		display: grid;
		gap: 0.7rem;
		justify-items: start;
	}
	.meta p {
		margin: 0;
	}
	.ai {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		color: var(--ink);
		margin: 0;
	}
	.locked {
		display: grid;
		justify-items: center;
		gap: 0.8rem;
		text-align: center;
		color: var(--ink-soft);
		padding-block: 3rem;
	}
</style>
