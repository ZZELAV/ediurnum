<script lang="ts">
	import { enhance } from '$app/forms';
	import Cover from '$lib/components/Cover.svelte';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import { t } from '$lib/i18n/t';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>{t('recover.title')} · ediurnum</title></svelte:head>

<Cover>
	<h1>{t('recover.title')}</h1>
	<p class="muted">{t('recover.intro')}</p>
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
		<input class="visually-hidden" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" />
		<div class="field">
			<label for="rk">{t('setup.recoveryKey')}</label>
			<input id="rk" name="recoveryKey" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" required />
		</div>
		<div class="field">
			<label for="pw">{t('setup.newPassword')}</label>
			<PasswordInput id="pw" name="password" autocomplete="new-password" required minlength={10} />
			<p class="faint">{t('setup.passwordHint')}</p>
		</div>
		<div class="field">
			<label for="pw2">{t('setup.passwordConfirm')}</label>
			<PasswordInput id="pw2" name="confirm" autocomplete="new-password" required minlength={10} />
		</div>
		<div class="row" style="justify-content: space-between">
			<button class="btn" disabled={busy}>{t('recover.submit')}</button>
			<a href="/login" class="faint">{t('recover.backToLogin')}</a>
		</div>
	</form>
</Cover>
