<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { autosize } from '#lib/actions.ts';
	import { Flash } from '#lib/flash.svelte.ts';
	import { fmtDate, t } from '#lib/i18n/t.ts';
	import { JOURNALING, TRAITS, VALUES, sanitizeProfile, type ProfileText } from '#lib/profile.ts';

	let { data } = $props();

	// Formularzustand: Startwerte aus dem gespeicherten Profil (nur beim Öffnen gelesen)
	let profile = $state(sanitizeProfile(untrack(() => data.profile)));
	let busy = $state(false);
	const notice = new Flash();

	const steps = [1, 2, 3, 4, 5];
	const groups: { title: string; fields: ProfileText[] }[] = [
		{ title: 'profile.group.values', fields: ['strengths', 'challenges', 'goals'] },
		{ title: 'profile.group.ai', fields: ['coping', 'hopes', 'sensitive'] }
	];

	function toggleValue(v: string) {
		profile.values = profile.values.includes(v) ? profile.values.filter((x) => x !== v) : [...profile.values, v];
	}

	const setText = (k: ProfileText, v: string) => (profile.texts[k] = v);
</script>

<svelte:head><title>{t('profile.title')} · ediurnum</title></svelte:head>

{#snippet textField(k: ProfileText)}
	<div class="field">
		<label class="question" for="p-{k}">{t(`profile.${k}`)}</label>
		<textarea
			id="p-{k}"
			class="write"
			rows="2"
			placeholder={t(`profile.${k}.hint`)}
			value={profile.texts[k] ?? ''}
			oninput={(e) => setText(k, e.currentTarget.value)}
			use:autosize
		></textarea>
	</div>
{/snippet}

<div class="view narrow">
	<header class="view-head">
		<div>
			{#if data.welcome}<p class="eyebrow">{t('profile.welcomeEyebrow')}</p>{/if}
			<h1>{data.welcome ? t('profile.welcomeTitle', { name: data.name }) : t('profile.title')}</h1>
			<p class="muted intro">{data.welcome ? t('profile.welcomeIntro') : t('profile.intro')}</p>
			{#if profile.updatedAt && !data.welcome}<p class="faint">{t('profile.updated', { date: fmtDate(profile.updatedAt, 'medium') })}</p>{/if}
		</div>
	</header>

	<form
		method="POST"
		action="?/save"
		class="stack"
		use:enhance={() => {
			busy = true;
			notice.clear();
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'success') {
					if (data.welcome) return goto('/', { refreshAll: true });
					notice.show(t('profile.saved'));
					await update({ reset: false });
				} else {
					notice.show(t('common.error'), 'error');
				}
			};
		}}
	>
		<input type="hidden" name="profile" value={JSON.stringify(profile)} />

		<section class="card">
			<h2>{t('profile.group.start')}</h2>
			<fieldset class="field">
				<legend class="question">{t('profile.journaling')}</legend>
				<div class="pills">
					{#each JOURNALING as j (j)}
						<label class="pill" class:on={profile.journaling === j}>
							<input type="radio" name="journaling" value={j} bind:group={profile.journaling} />
							{t(`profile.journaling.${j}`)}
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset class="field">
				<legend class="question">{t('profile.satisfaction')}</legend>
				<div class="poles">
					<span class="faint">{t('profile.satisfaction.low')}</span>
					<div class="dots" role="radiogroup" aria-label={t('profile.satisfaction')}>
						{#each steps as n (n)}
							<button
								type="button"
								role="radio"
								aria-checked={profile.satisfaction === n}
								aria-label="{n}/5"
								class="dot"
								class:on={profile.satisfaction === n}
								onclick={() => (profile.satisfaction = profile.satisfaction === n ? null : n)}
							></button>
						{/each}
					</div>
					<span class="faint">{t('profile.satisfaction.high')}</span>
				</div>
			</fieldset>

			{@render textField('life')}
		</section>

		<section class="card">
			<h2>{t('profile.group.traits')}</h2>
			<p class="faint">{t('profile.traitsIntro')}</p>
			{#each TRAITS as trait (trait)}
				<fieldset class="field trait">
					<legend class="question">{t(`profile.trait.${trait}`)}</legend>
					<div class="poles">
						<span class="faint">{t(`profile.trait.${trait}.low`)}</span>
						<div class="dots" role="radiogroup" aria-label={t(`profile.trait.${trait}`)}>
							{#each steps as n (n)}
								<button
									type="button"
									role="radio"
									aria-checked={profile.traits[trait] === n}
									aria-label="{n}/5"
									class="dot"
									class:on={profile.traits[trait] === n}
									onclick={() => (profile.traits[trait] = profile.traits[trait] === n ? null : n)}
								></button>
							{/each}
						</div>
						<span class="faint">{t(`profile.trait.${trait}.high`)}</span>
					</div>
				</fieldset>
			{/each}
		</section>

		{#each groups as g, i (g.title)}
			<section class="card">
				<h2>{t(g.title)}</h2>
				{#if i === 0}
					<div class="field">
						<p class="question">{t('profile.values')}</p>
						<p class="faint">{t('profile.valuesHint')}</p>
						<div class="chips">
							{#each VALUES as v (v)}
								{@const on = profile.values.includes(v)}
								<button type="button" class="chip-btn" class:on aria-pressed={on} onclick={() => toggleValue(v)}>
									{t(`profile.value.${v}`)}
								</button>
							{/each}
						</div>
					</div>
				{:else}
					<p class="faint">{t('profile.aiIntro')}</p>
				{/if}
				{#each g.fields as k (k)}{@render textField(k)}{/each}
			</section>
		{/each}

		{#if notice.current}<p class="notice" class:error={notice.current.kind === 'error'} role="status" out:fade>{notice.current.text}</p>{/if}

		<div class="row">
			<button class="btn" disabled={busy}>{data.welcome ? t('profile.saveWelcome') : t('common.save')}</button>
			{#if data.welcome}
				<a class="btn quiet" href="/">{t('profile.skip')}</a>
			{:else}
				<a class="btn quiet" href="/settings#profile">{t('common.back')}</a>
			{/if}
		</div>
		<p class="faint">{t('profile.privacy')}</p>
	</form>
</div>

<style>
	.intro {
		margin: 0.3rem 0 0.4rem;
		max-width: 60ch;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 1.25rem;
		min-width: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.pills,
	.chips {
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
	.poles {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 0.75rem;
	}
	.poles > span:first-child {
		text-align: right;
	}
	.dots {
		display: flex;
		gap: 0.35rem;
	}
	.dot {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border-radius: 50%;
		border: 2px solid var(--paper-edge);
		background: var(--paper-2);
		cursor: pointer;
		transition:
			transform 0.15s,
			background 0.15s;
	}
	.dot:hover {
		border-color: var(--accent);
	}
	.dot.on {
		background: var(--accent);
		border-color: var(--accent);
		transform: scale(1.1);
	}
	@media (max-width: 520px) {
		/* Pole über und unter den Punkten, damit nichts seitlich überläuft */
		.poles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.poles > span:first-child {
			text-align: left;
		}
		.poles > span:last-child {
			text-align: right;
		}
		.dots {
			grid-column: 1 / -1;
			grid-row: 1;
			justify-content: space-between;
		}
	}
	.chip-btn {
		font: inherit;
		font-size: 0.86rem;
		padding: 0.3rem 0.8rem;
		border-radius: 999px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-2);
		color: var(--ink-soft);
		cursor: pointer;
	}
	.chip-btn.on {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-strong);
	}
</style>
