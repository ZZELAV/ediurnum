<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n/t.ts';

	/** First steps after setup. Completed steps tick themselves off automatically. */
	let { steps, today }: { steps: Record<string, boolean>; today: string } = $props();

	const items = $derived([
		{ id: 'entry', href: `/entry/${today}` },
		{ id: 'profile', href: '/profile' },
		{ id: 'reminders', href: '/reminders' },
		{ id: 'pin', href: '/settings#security' },
		{ id: 'backup', href: '/settings#backup' }
	]);
	const done = $derived(items.filter((i) => steps[i.id]).length);
</script>

<section class="card welcome" aria-labelledby="welcome-title">
	<div class="head">
		<div>
			<h2 id="welcome-title">{t('welcome.title')}</h2>
			<p class="faint">{t('welcome.progress', { done, total: items.length })}</p>
		</div>
		<form method="POST" action="/?/hideWelcome" use:enhance>
			<button class="btn quiet small">{t('welcome.hide')}</button>
		</form>
	</div>
	<div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label={t('welcome.title')}>
		<span style:width="{(done / items.length) * 100}%"></span>
	</div>
	<ol>
		{#each items as item (item.id)}
			{@const ok = steps[item.id]}
			<li class:ok>
				<span class="mark" aria-hidden="true">{ok ? '✓' : ''}</span>
				<div>
					{#if ok}
						<span class="label">{t(`welcome.${item.id}`)}</span>
						<span class="visually-hidden">({t('welcome.done')})</span>
					{:else}
						<a class="label" href={item.href}>{t(`welcome.${item.id}`)}</a>
						<p class="faint">{t(`welcome.${item.id}.hint`)}</p>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
</section>

<style>
	.welcome {
		border-left: 3px solid var(--dusk);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}
	h2 {
		margin-bottom: 0.15rem;
	}
	.head p {
		margin: 0;
	}
	.bar {
		height: 6px;
		border-radius: 999px;
		background: var(--paper-2);
		margin: 0.75rem 0 1rem;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
		transition: width 0.3s ease;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.7rem;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		align-items: start;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		border: 2px solid var(--paper-edge);
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--paper);
	}
	.ok .mark {
		background: var(--accent);
		border-color: var(--accent);
	}
	.label {
		font-weight: 500;
	}
	.ok .label {
		color: var(--ink-faint);
		text-decoration: line-through;
		font-weight: 400;
	}
	li p {
		margin: 0.1rem 0 0;
	}
</style>
