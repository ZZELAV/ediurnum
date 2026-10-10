<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import Cover from '$lib/components/Cover.svelte';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import { t } from '$lib/i18n/t';

	let { form } = $props();

	let mode = $state<'new' | 'restore'>('new');
	let busy = $state(false);
	let recoveryKey = $state<string | null>(null);
	let confirmed = $state(false);
	let copied = $state(false);
	let error = $state<string | null>(null);
	let name = $state('');

	$effect(() => {
		if (form?.error) {
			error = form.error;
			const f = form as { name?: string };
			if (f.name) name = f.name;
			if ((form as { mode?: string }).mode === 'restore') mode = 'restore';
		}
	});

	async function copy() {
		if (!recoveryKey) return;
		await navigator.clipboard.writeText(recoveryKey);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function download() {
		if (!recoveryKey) return;
		const blob = new Blob([t('setup.keyFileText') + recoveryKey + '\n'], { type: 'text/plain' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'ediurnum-wiederherstellungsschluessel.txt';
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>{t('setup.title')} · ediurnum</title></svelte:head>

<Cover wide={recoveryKey !== null}>
	{#if recoveryKey}
		<h1>{t('setup.keyTitle')}</h1>
		<p class="muted">{t('setup.keyIntro')}</p>
		<div class="key" data-testid="recovery-key">{recoveryKey}</div>
		<div class="row" style="margin-bottom: 1rem">
			<button type="button" class="btn ghost small" onclick={copy}>{copied ? t('setup.keyCopied') : t('setup.keyCopy')}</button>
			<button type="button" class="btn ghost small" onclick={download}>{t('setup.keyDownload')}</button>
		</div>
		<p class="notice error">{t('setup.keyWarning')}</p>
		<label class="check">
			<input type="checkbox" bind:checked={confirmed} />
			{t('setup.keyConfirm')}
		</label>
		<!-- Ohne href ist der Link auch per Tastatur nicht erreichbar -->
		<a class="btn" href={confirmed ? '/profile?welcome' : undefined} aria-disabled={!confirmed} class:disabled={!confirmed} data-sveltekit-reload>{t('setup.start')}</a>
	{:else}
		<h1>{t('setup.title')}</h1>
		<div class="tabs" role="tablist">
			<button type="button" role="tab" aria-selected={mode === 'new'} class:active={mode === 'new'} onclick={() => { mode = 'new'; error = null; }}>{t('setup.tabNew')}</button>
			<button type="button" role="tab" aria-selected={mode === 'restore'} class:active={mode === 'restore'} onclick={() => { mode = 'restore'; error = null; }}>{t('setup.tabRestore')}</button>
		</div>

		{#if error}<p class="notice error" role="alert">{t(error)}</p>{/if}

		{#if mode === 'new'}
			<p class="muted">{t('setup.intro')}</p>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					busy = true;
					error = null;
					return async ({ result }) => {
						busy = false;
						if (result.type === 'success' && result.data?.recoveryKey) {
							recoveryKey = String(result.data.recoveryKey);
						} else {
							await applyAction(result);
						}
					};
				}}
			>
				<div class="field">
					<label for="name">{t('setup.name')}</label>
					<input id="name" name="name" type="text" autocomplete="given-name" maxlength="60" required bind:value={name} />
					<p class="faint">{t('setup.nameHint')}</p>
				</div>
				<!-- Für Passwortmanager: der Name dient als Benutzername, damit Speichern und Ausfüllen zuverlässig klappt -->
				<input class="visually-hidden" type="text" name="username" value={name} autocomplete="username" tabindex="-1" aria-hidden="true" readonly />
				<p class="faint pm">{t('setup.passwordManager')}</p>
				<div class="field">
					<label for="pw">{t('setup.password')}</label>
					<PasswordInput id="pw" name="password" autocomplete="new-password" required minlength={10} />
					<p class="faint">{t('setup.passwordHint')}</p>
				</div>
				<div class="field">
					<label for="pw2">{t('setup.passwordConfirm')}</label>
					<PasswordInput id="pw2" name="confirm" autocomplete="new-password" required minlength={10} />
				</div>
				<button class="btn" disabled={busy}>{busy ? t('setup.creating') : t('setup.create')}</button>
			</form>
		{:else}
			<p class="muted">{t('setup.restoreIntro')}</p>
			<form
				method="POST"
				action="?/restore"
				enctype="multipart/form-data"
				use:enhance={() => {
					busy = true;
					error = null;
					return async ({ update }) => {
						busy = false;
						await update();
					};
				}}
			>
				<div class="field">
					<label for="file">{t('setup.backupFile')}</label>
					<input id="file" name="backup" type="file" accept=".ediurnum,application/json" required />
				</div>
				<div class="field">
					<label for="rk">{t('setup.recoveryKey')}</label>
					<input id="rk" name="recoveryKey" type="text" autocomplete="off" spellcheck="false" required class="mono" />
				</div>
				<div class="field">
					<label for="rpw">{t('setup.newPassword')}</label>
					<PasswordInput id="rpw" name="password" autocomplete="new-password" required minlength={10} />
					<p class="faint">{t('setup.passwordHint')}</p>
				</div>
				<div class="field">
					<label for="rpw2">{t('setup.passwordConfirm')}</label>
					<PasswordInput id="rpw2" name="confirm" autocomplete="new-password" required minlength={10} />
				</div>
				<button class="btn" disabled={busy}>{busy ? t('setup.restoring') : t('setup.restore')}</button>
			</form>
		{/if}
	{/if}
</Cover>

<style>
	.tabs {
		display: flex;
		gap: 0.25rem;
		margin: 0.5rem 0 1.25rem;
		border-bottom: 1px solid var(--paper-edge);
	}
	.tabs button {
		font: inherit;
		background: none;
		border: 0;
		padding: 0.5rem 0.8rem;
		color: var(--ink-soft);
		border-bottom: 2px solid transparent;
		cursor: pointer;
	}
	.tabs button.active {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
	.key {
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		font-size: 1.05rem;
		letter-spacing: 0.04em;
		word-spacing: 0.2em;
		line-height: 1.9;
		padding: 1rem 1.2rem;
		margin: 1rem 0;
		background: var(--paper-2);
		border: 1px dashed var(--gold);
		border-radius: var(--radius);
		word-break: break-word;
		user-select: all;
	}
	.mono {
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
	}
	.check {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		color: var(--ink);
		margin: 1rem 0 1.25rem;
	}
	.check input {
		margin-top: 0.05rem;
	}
	.pm {
		margin: -0.5rem 0 1.25rem;
	}
	a.disabled {
		pointer-events: none;
		opacity: 0.5;
	}
</style>
