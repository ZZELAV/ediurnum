<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/client';
	import { t } from '$lib/i18n/t';

	let { open = $bindable(false), onunlocked }: { open?: boolean; onunlocked?: () => void } = $props();

	let pin = $state('');
	let error = $state<string | null>(null);
	let seconds = $state(0);
	let busy = $state(false);
	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			pin = '';
			error = null;
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const res = await api<{ until: number }>('/api/pin', 'POST', { pin });
		busy = false;
		if (res.ok) {
			open = false;
			await invalidateAll();
			onunlocked?.();
		} else {
			error = res.error;
			seconds = Number(res.data.seconds ?? 0);
			pin = '';
		}
	}
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} class="pin-dialog">
	<form onsubmit={submit}>
		<h2>{t('pin.title')}</h2>
		<p class="faint">{t('pin.intro')}</p>
		{#if error}<p class="notice error" role="alert">{t(error, { seconds })}</p>{/if}
		<label for="pin-input" class="visually-hidden">{t('pin.label')}</label>
		<input
			id="pin-input"
			type="password"
			inputmode="numeric"
			autocomplete="off"
			pattern="[0-9]*"
			maxlength="12"
			bind:value={pin}
			class="pin"
		/>
		<div class="row" style="justify-content: flex-end; margin-top: 1rem">
			<button type="button" class="btn quiet" onclick={() => (open = false)}>{t('common.cancel')}</button>
			<button class="btn" disabled={busy || pin.length < 4}>{t('pin.submit')}</button>
		</div>
	</form>
</dialog>

<style>
	.pin-dialog {
		border: 0;
		border-radius: 14px;
		padding: 1.5rem 1.75rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: var(--shadow);
		width: min(360px, calc(100vw - 2rem));
	}
	.pin-dialog::backdrop {
		background: rgba(20, 16, 10, 0.45);
		backdrop-filter: blur(3px);
	}
	.pin {
		font-size: 1.6rem;
		letter-spacing: 0.5em;
		text-align: center;
	}
</style>
