<script lang="ts">
	import { enhance } from '$app/forms';
	import Cover from '#lib/components/Cover.svelte';
	import PasswordInput from '#lib/components/PasswordInput.svelte';
	import { t } from '#lib/i18n/t.ts';

	let { form } = $props();
	let busy = $state(false);
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
		<!-- Für Passwortmanager: Feld für den Benutzernamen (den Vornamen), den der Passwortmanager selbst ausfüllt -->
		<input class="visually-hidden" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" />
		<div class="field">
			<label for="pw">{t('setup.password')}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<PasswordInput id="pw" name="password" autocomplete="current-password" required autofocus />
		</div>
		<div class="row" style="justify-content: space-between">
			<button class="btn" disabled={busy}>{busy ? t('common.loading') : t('login.submit')}</button>
			<a href="/recover" class="faint">{t('login.forgot')}</a>
		</div>
	</form>
</Cover>
