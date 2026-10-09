<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { t } from '$lib/i18n/t';

	/** Passwortfeld mit Auge zum Anzeigen/Verbergen. Alle übrigen Attribute gehen an das Eingabefeld. */
	let {
		value = $bindable(),
		show = $bindable(false),
		class: className = '',
		...rest
	}: Omit<HTMLInputAttributes, 'type'> & { show?: boolean } = $props();
</script>

<div class="password">
	<input {...rest} class={className} type={show ? 'text' : 'password'} autocapitalize="off" spellcheck="false" bind:value />
	<button
		type="button"
		class="eye"
		onclick={() => (show = !show)}
		aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
		aria-pressed={show}
		title={show ? t('login.hidePassword') : t('login.showPassword')}
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
			{#if show}<path d="M4 4l16 16" />{/if}
		</svg>
	</button>
</div>

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
