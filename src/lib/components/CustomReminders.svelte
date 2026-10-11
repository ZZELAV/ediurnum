<script lang="ts">
	import { fade } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { ask } from '#lib/confirm.svelte.ts';
	import { fmtDate, t, weekdayName, WEEK_ORDER } from '#lib/i18n/t.ts';
	import type { CustomReminder, CustomReminderView } from '#lib/reminders.ts';
	import { Flash } from '#lib/flash.svelte.ts';
	import CustomReminderForm from './CustomReminderForm.svelte';

	interface Props {
		items: CustomReminderView[];
		today: string;
		/** Formular für eine neue Erinnerung geöffnet (von aussen steuerbar). */
		creating?: boolean;
	}
	let { items, today, creating = $bindable(false) }: Props = $props();

	let editingId = $state<string | null>(null);
	const message = new Flash();

	function describe(r: CustomReminder): string {
		const time = r.time;
		switch (r.repeat) {
			case 'once':
				return t('reminders.schedule.once', { date: fmtDate(r.date, 'medium'), time });
			case 'daily':
				return t('reminders.schedule.daily', { time });
			case 'weekly':
				if (r.weekdays.length === 7) return t('reminders.schedule.daily', { time });
				return t('reminders.schedule.weekly', {
					days: WEEK_ORDER.filter((d) => r.weekdays.includes(d))
						.map((d) => weekdayName(d, r.weekdays.length > 2 ? 'short' : 'long'))
						.join(', '),
					time
				});
			case 'monthly':
				return r.day === 'last' ? t('reminders.schedule.monthlyLast', { time }) : t('reminders.schedule.monthly', { day: r.day, time });
		}
	}

	function openNew() {
		editingId = null;
		message.clear();
		creating = true;
	}
	function openEdit(id: string) {
		creating = false;
		message.clear();
		editingId = id;
	}
	const saved = (text: string) => message.show(text);
</script>

{#if message.current}<p class="notice" role="status" out:fade>{message.current.text}</p>{/if}

{#if items.length === 0 && !creating}
	<p class="muted">{t('reminders.customEmpty')}</p>
{/if}

<ul class="list">
	{#each items as r (r.id)}
		<li class:off={!r.enabled || !r.next}>
			<div class="item">
				<form
					method="POST"
					action="/reminders?/toggle"
					use:enhance={() => async ({ update }) => update({ reset: false })}
				>
					<input type="hidden" name="id" value={r.id} />
					<input type="hidden" name="enabled" value={String(!r.enabled)} />
					<button
						class="switch"
						class:on={r.enabled}
						role="switch"
						aria-checked={r.enabled}
						aria-label={t('reminders.active', { title: r.title })}
						title={r.enabled ? t('reminders.pause') : t('reminders.resume')}
					><span></span></button>
				</form>
				<div class="text">
					<strong>{r.title}</strong>
					{#if r.body}<p class="body">{r.body}</p>{/if}
					<p class="faint when">
						{describe(r)}
						<span class="sep">·</span>
						{#if !r.enabled}
							<span class="chip muted-chip">{t('reminders.paused')}</span>
						{:else if !r.next}
							<span class="chip muted-chip">{t('reminders.over')}</span>
						{:else if r.next === today}
							<span class="chip">{t('reminders.nextToday', { time: r.time })}</span>
						{:else}
							{t('reminders.next', { date: fmtDate(r.next, 'dayMonth') })}
						{/if}
					</p>
				</div>
				<div class="actions">
					<button type="button" class="btn quiet small" onclick={() => openEdit(r.id)}>{t('common.edit')}</button>
					<form
						method="POST"
						action="/reminders?/delete"
						use:enhance={async ({ cancel }) => {
							if (!(await ask(t('reminders.deleteConfirm', { title: r.title }), { confirmLabel: t('common.delete'), danger: true }))) return cancel();
							return async ({ update }) => {
								await update({ reset: false });
								if (editingId === r.id) editingId = null;
								message.show(t('reminders.deleted'));
							};
						}}
					>
						<input type="hidden" name="id" value={r.id} />
						<button class="btn quiet small danger-text">{t('common.delete')}</button>
					</form>
				</div>
			</div>
			{#if editingId === r.id}
				<CustomReminderForm reminder={r} {today} onclose={() => (editingId = null)} onsaved={saved} />
			{/if}
		</li>
	{/each}
</ul>

{#if creating}
	<CustomReminderForm reminder={null} {today} onclose={() => (creating = false)} onsaved={saved} />
{:else}
	<button type="button" class="btn ghost" onclick={openNew}>+ {t('reminders.new')}</button>
{/if}

<style>
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
	}
	.list li + li {
		border-top: 1px solid var(--rule);
	}
	.item {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.85rem;
		align-items: start;
		padding: 0.8rem 0;
	}
	.off .text {
		opacity: 0.6;
	}
	.text strong {
		font-weight: 600;
	}
	.body {
		margin: 0.15rem 0 0;
		color: var(--ink-soft);
		font-size: 0.92rem;
	}
	.when {
		margin: 0.3rem 0 0;
		font-size: 0.85rem;
	}
	.sep {
		margin: 0 0.25rem;
	}
	.muted-chip {
		background: var(--paper-2);
		color: var(--ink-faint);
	}
	.actions {
		display: flex;
		gap: 0.1rem;
	}
	.danger-text {
		color: var(--danger);
	}
	.switch {
		position: relative;
		width: 2.4rem;
		height: 1.4rem;
		margin-top: 0.1rem;
		border-radius: 999px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-2);
		cursor: pointer;
		padding: 0;
		transition: background 0.15s;
	}
	.switch span {
		position: absolute;
		top: 50%;
		left: 0.18rem;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--ink-faint);
		transform: translateY(-50%);
		transition:
			left 0.15s,
			background 0.15s;
	}
	.switch.on {
		background: var(--accent);
		border-color: var(--accent);
	}
	.switch.on span {
		left: calc(100% - 1.18rem);
		background: var(--paper);
	}
	.switch:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 560px) {
		.item {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.actions {
			grid-column: 2;
			margin-left: -0.6rem;
		}
	}
</style>
