<script lang="ts">
	import { enhance } from '$app/forms';
	import Cover from '$lib/components/Cover.svelte';
	import { t } from '$lib/i18n/t';

	let { form } = $props();
	let busy = $state(false);
	let showPassword = $state(false);
</script>

<svelte:head><title>{t('login.title')} · ediurnum</title></svelte:head>

<Cover>
	<h1>{t('login.title')}</h1>
	<p class="muted">{t('login.intro')}</p>
	{#if form?.error}
		<p class="notice error" role="alert">{t(form.error, { seconds: (form as { seconds?: number }).seconds ?? 0 })}</p>
	{/if}
	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				busy = false;
				await update();
			};
		}}
	>
		<div class="field">
			<label for="pw">{t('setup.password')}</label>
			<div class="password">
				<!-- svelte-ignore a11y_autofocus -->
				<input id="pw" name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" autocapitalize="off" spellcheck="false" required autofocus />
				<button
					type="button"
					class="eye"
					onclick={() => (showPassword = !showPassword)}
					aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
					aria-pressed={showPassword}
					title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
						{#if showPassword}<path d="M4 4l16 16" />{/if}
					</svg>
				</button>
			</div>
		</div>
		<div class="row" style="justify-content: space-between">
			<button class="btn" disabled={busy}>{busy ? t('common.loading') : t('login.submit')}</button>
			<a href="/recover" class="faint">{t('login.forgot')}</a>
		</div>
	</form>
</Cover>

<style>
	.password {
		position: relative;
	}
	.password input {
		padding-right: 2.75rem;
	}
	.eye {
		position: absolute;
		top: 50%;
		right: 0.35rem;
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--ink-faint);
		cursor: pointer;
	}
	.eye:hover {
		color: var(--ink);
		background: var(--paper-2);
	}
</style>
