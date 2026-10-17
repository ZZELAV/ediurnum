<script lang="ts">
	import { fade } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { fmtDate, t, weekdayName, WEEK_ORDER } from '#lib/i18n/t.ts';
	import type { ReminderConfig } from '#lib/reminders.ts';

	interface Props {
		feelings: ReminderConfig['feelings'] & { next: string | null };
		growth: ReminderConfig['growth'] & { next: string | null };
		today: string;
		feedback?: { kind: string; text: string } | null;
	}
	let { feelings, growth, today, feedback = null }: Props = $props();

	const monthDays = Array.from({ length: 28 }, (_, i) => i + 1);

	function nextText(next: string | null, time: string) {
		if (!next) return '';
		return next === today ? t('reminders.nextToday', { time }) : t('reminders.next', { date: fmtDate(next, 'dayMonth') });
	}
</script>

<p class="faint">{t('settings.remindersIntro')}</p>
{#if feedback}<p class="notice" class:error={feedback.kind === 'error'} role="status" out:fade>{feedback.text}</p>{/if}

<form method="POST" action="?/reviews" use:enhance={() => async ({ update }) => update({ reset: false })}>
	<fieldset class="reminder">
		<legend>
			<label class="switch">
				<input type="checkbox" role="switch" name="feelingsEnabled" checked={feelings.enabled} />
				<span><strong>{t('section.feelings.title')}</strong> <span class="faint">· {t('entry.rhythm.weekly')}</span></span>
			</label>
		</legend>
		<div class="grid">
			<div class="field">
				<label for="r-gw">{t('settings.remindWeekday')}</label>
				<select id="r-gw" name="feelingsWeekday" value={String(feelings.weekday)}>
					{#each WEEK_ORDER as d (d)}<option value={String(d)}>{weekdayName(d)}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="r-gt">{t('settings.remindTime')}</label>
				<input id="r-gt" name="feelingsTime" type="time" value={feelings.time} required />
			</div>
		</div>
		{#if feelings.enabled && feelings.next}<p class="faint next">{nextText(feelings.next, feelings.time)}</p>{/if}
	</fieldset>

	<fieldset class="reminder">
		<legend>
			<label class="switch">
				<input type="checkbox" role="switch" name="growthEnabled" checked={growth.enabled} />
				<span><strong>{t('section.growth.title')}</strong> <span class="faint">· {t('entry.rhythm.monthly')}</span></span>
			</label>
		</legend>
		<div class="grid">
			<div class="field">
				<label for="r-wd">{t('settings.remindDay')}</label>
				<select id="r-wd" name="growthDay" value={String(growth.day)}>
					<option value="last">{t('settings.remindLastDay')}</option>
					{#each monthDays as d (d)}<option value={String(d)}>{d}.</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="r-wt">{t('settings.remindTime')}</label>
				<input id="r-wt" name="growthTime" type="time" value={growth.time} required />
			</div>
		</div>
		{#if growth.enabled && growth.next}<p class="faint next">{nextText(growth.next, growth.time)}</p>{/if}
	</fieldset>

	<button class="btn">{t('common.save')}</button>
</form>

<style>
	.reminder {
		border: 1px solid var(--paper-edge);
		border-radius: 12px;
		padding: 0.9rem 1rem 0.2rem;
		margin: 0 0 1rem;
	}
	legend {
		padding: 0 0.3rem;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink);
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
		gap: 0 1rem;
	}
	.next {
		margin: 0.75rem 0 0.9rem;
		font-size: 0.85rem;
	}
</style>
