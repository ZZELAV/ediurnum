<script lang="ts">
	import { enhance } from '$app/forms';
	import { weekdayOf } from '#lib/dates.ts';
	import { t, weekdayName, WEEK_ORDER } from '#lib/i18n/t.ts';
	import { CUSTOM_REPEATS, type CustomReminder, type CustomRepeat } from '#lib/reminders.ts';

	interface Props {
		reminder: CustomReminder | null;
		today: string;
		onclose: () => void;
		onsaved: (message: string) => void;
	}
	let { reminder, today, onclose, onsaved }: Props = $props();

	// form state – initial values from the existing reminder (read only when opening)
	const initial = (() => ({ reminder, weekday: weekdayOf(today) }))();
	let repeat = $state<CustomRepeat>(initial.reminder?.repeat ?? 'daily');
	let weekdays = $state<number[]>(initial.reminder?.weekdays.length ? [...initial.reminder.weekdays] : [initial.weekday]);
	let error = $state<string | null>(null);
	let busy = $state(false);

	const monthDays = Array.from({ length: 28 }, (_, i) => i + 1);
	const uid = $props.id();
</script>

<form
	class="reminder-form"
	method="POST"
	action="/reminders?/save"
	use:enhance={() => {
		busy = true;
		error = null;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'failure') {
				error = t(String(result.data?.error ?? 'common.error'));
				return;
			}
			if (result.type === 'error') {
				error = t('common.error');
				return;
			}
			await update({ reset: false });
			onsaved(t('reminders.saved'));
			onclose();
		};
	}}
>
	<h3>{reminder ? t('reminders.edit') : t('reminders.new')}</h3>
	{#if reminder}<input type="hidden" name="id" value={reminder.id} />{/if}
	<input type="hidden" name="enabled" value={String(reminder?.enabled ?? true)} />

	<div class="field">
		<label for="{uid}-title">{t('reminders.fieldTitle')}</label>
		<input id="{uid}-title" name="title" type="text" maxlength="100" required value={reminder?.title ?? ''} placeholder={t('reminders.titlePlaceholder')} />
	</div>
	<div class="field">
		<label for="{uid}-body">{t('reminders.fieldBody')} <span class="faint">({t('common.optional')})</span></label>
		<input id="{uid}-body" name="body" type="text" maxlength="300" value={reminder?.body ?? ''} />
	</div>

	<div class="grid">
		<div class="field">
			<label for="{uid}-repeat">{t('reminders.repeat')}</label>
			<select id="{uid}-repeat" name="repeat" bind:value={repeat}>
				{#each CUSTOM_REPEATS as r (r)}<option value={r}>{t(`reminders.repeat.${r}`)}</option>{/each}
			</select>
		</div>
		{#if repeat === 'once'}
			<div class="field">
				<label for="{uid}-date">{t('reminders.date')}</label>
				<input id="{uid}-date" name="date" type="date" min={today} value={reminder?.date || today} required />
			</div>
		{:else if repeat === 'monthly'}
			<div class="field">
				<label for="{uid}-day">{t('settings.remindDay')}</label>
				<select id="{uid}-day" name="day" value={String(reminder?.repeat === 'monthly' ? reminder.day : 1)}>
					<option value="last">{t('settings.remindLastDay')}</option>
					{#each monthDays as d (d)}<option value={String(d)}>{d}.</option>{/each}
				</select>
			</div>
		{/if}
		<div class="field">
			<label for="{uid}-time">{t('settings.remindTime')}</label>
			<input id="{uid}-time" name="time" type="time" value={reminder?.time ?? '08:00'} required />
		</div>
	</div>

	{#if repeat === 'weekly'}
		<fieldset class="field days">
			<legend>{t('reminders.weekdays')}</legend>
			<div class="row">
				{#each WEEK_ORDER as d (d)}
					<label class="day">
						<input type="checkbox" name="weekdays" value={d} bind:group={weekdays} aria-label={weekdayName(d)} />
						<span>{weekdayName(d, 'short')}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	<p class="faint hint">{t('reminders.plainHint')}</p>
	{#if error}<p class="notice error" role="alert">{error}</p>{/if}

	<div class="row">
		<button class="btn" disabled={busy}>{t('common.save')}</button>
		<button type="button" class="btn quiet" onclick={onclose}>{t('common.cancel')}</button>
	</div>
</form>

<style>
	.reminder-form {
		border: 1px solid var(--paper-edge);
		border-radius: 12px;
		padding: 1rem;
		margin: 0.75rem 0 1rem;
		background: var(--paper);
	}
	h3 {
		margin: 0 0 0.9rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
		gap: 0 1rem;
	}
	.grid .field:last-child {
		margin-bottom: 1.25rem;
	}
	.days {
		border: 0;
		padding: 0;
		margin: 0 0 1.25rem;
	}
	.days legend {
		padding: 0;
		margin-bottom: 0.4rem;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	.days .row {
		gap: 0.4rem;
	}
	.day {
		margin: 0;
		cursor: pointer;
	}
	.day input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.day span {
		display: inline-block;
		min-width: 2.8rem;
		text-align: center;
		padding: 0.35rem 0.6rem;
		border-radius: 999px;
		border: 1px solid var(--paper-edge);
		color: var(--ink-soft);
		font-size: 0.85rem;
	}
	.day input:checked + span {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-strong);
		font-weight: 500;
	}
	.day input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.hint {
		font-size: 0.82rem;
	}
</style>
