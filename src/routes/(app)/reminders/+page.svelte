<script lang="ts">
	import CustomReminders from '#lib/components/CustomReminders.svelte';
	import PushDevices from '#lib/components/PushDevices.svelte';
	import ReviewReminders from '#lib/components/ReviewReminders.svelte';
	import { expiring } from '#lib/flash.svelte.ts';
	import { t } from '#lib/i18n/t.ts';
	import { minutesOf } from '#lib/reminders.ts';

	let { data, form } = $props();

	const reviewResult = expiring(() => form as { section?: string; success?: string } | null);
	const reviewFeedback = $derived.by(() => {
		const f = reviewResult.current;
		return f?.section === 'reviews' && f.success ? { kind: 'ok', text: t(f.success) } : null;
	});


	const todayItems = $derived(
		data.custom
			.filter((r) => r.enabled && r.today)
			.map((r) => ({ ...r, passed: minutesOf(r.time) <= data.now.minutes }))
			.sort((a, b) => a.time.localeCompare(b.time))
	);
	const reviews = $derived(data.reviews);
	const nothingToday = $derived(todayItems.length === 0 && !reviews.feelings.due && !reviews.growth.due);
</script>

<svelte:head><title>{t('reminders.title')} · ediurnum</title></svelte:head>

<div class="view narrow">
	<header class="view-head">
		<div>
			<h1>{t('reminders.title')}</h1>
			<p class="faint intro">{t('reminders.intro')}</p>
		</div>
	</header>

	{#if data.push.devices.length === 0}
		<p class="notice info">
			{t('reminders.noDevices')}
			<a href="#push">{t('reminders.enablePush')} ↓</a>
		</p>
	{/if}

	<!-- Heute -->
	<section class="card today">
		<h2>{t('reminders.today')}</h2>
		{#if nothingToday}
			<p class="muted">{t('reminders.todayEmpty')}</p>
		{:else}
			<ul class="today-list">
				{#if reviews.feelings.due}
					<li>
						<span class="chip dusk">{t('section.feelings.title')}</span>
						<a href="/entry/{data.now.date}">{t('reminders.reviewDue')}</a>
					</li>
				{/if}
				{#if reviews.growth.due}
					<li>
						<span class="chip gold">{t('section.growth.title')}</span>
						<a href="/entry/{data.now.date}">{t('reminders.reviewDue')}</a>
					</li>
				{/if}
				{#each todayItems as r (r.id)}
					<li class:passed={r.passed}>
						<span class="time">{r.time}</span>
						<span class="what"><strong>{r.title}</strong>{#if r.body}<span class="faint"> · {r.body}</span>{/if}</span>
						{#if r.passed}<span class="faint small">✓ {t('reminders.passed')}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Eigene Erinnerungen -->
	<section class="card">
		<h2>{t('reminders.custom')}</h2>
		<CustomReminders items={data.custom} today={data.now.date} />
	</section>

	<!-- Rückblicke -->
	<section id="reviews" class="card">
		<h2>{t('reminders.reviews')}</h2>
		<ReviewReminders feelings={reviews.feelings} growth={reviews.growth} today={data.now.date} feedback={reviewFeedback} />
	</section>

	<!-- Push-Benachrichtigungen -->
	<section id="push" class="card">
		<h2>{t('settings.pushTitle')}</h2>
		<PushDevices push={data.push} />
	</section>

</div>

<style>
	.intro {
		margin: 0.3rem 0 0;
		max-width: 34rem;
	}
	.view-head {
		align-items: flex-start;
	}
	section {
		scroll-margin-top: 4.5rem;
		margin-bottom: 1rem;
	}
	section > h2 {
		margin-bottom: 0.75rem;
	}
	.today {
		border-left: 3px solid var(--accent);
	}
	.today-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.65rem;
	}
	.today-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
	}
	.today-list li.passed .what {
		opacity: 0.6;
	}
	.time {
		font-variant-numeric: tabular-nums;
		color: var(--accent-strong);
		font-weight: 600;
		min-width: 3rem;
	}
	.what {
		flex: 1;
		min-width: 0;
	}
	.small {
		font-size: 0.82rem;
	}
</style>
