<script lang="ts">
	import { answer, confirmState } from '#lib/confirm.svelte.ts';
	import { t } from '#lib/i18n/t.ts';

	let dialog: HTMLDialogElement | undefined = $state();
	const request = $derived(confirmState.request);

	$effect(() => {
		if (!dialog) return;
		if (request && !dialog.open) dialog.showModal();
		else if (!request && dialog.open) dialog.close();
	});
</script>

<dialog bind:this={dialog} class="confirm-dialog" onclose={() => confirmState.request && answer(false)} aria-labelledby="confirm-message">
	{#if request}
		<form method="dialog" onsubmit={(e) => { e.preventDefault(); answer(true); }}>
			<p id="confirm-message">{request.message}</p>
			<div class="row">
				<button type="button" class="btn quiet" onclick={() => answer(false)}>{t('common.cancel')}</button>
				<!-- svelte-ignore a11y_autofocus -->
				<button class="btn" class:danger={request.danger} autofocus>{request.confirmLabel ?? t('common.yes')}</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.confirm-dialog {
		border: 0;
		border-radius: 14px;
		padding: 1.4rem 1.6rem 1.2rem;
		background: var(--paper);
		color: var(--ink);
		box-shadow: var(--shadow);
		width: min(380px, calc(100vw - 2rem));
	}
	.confirm-dialog::backdrop {
		background: rgba(20, 16, 10, 0.45);
		backdrop-filter: blur(3px);
	}
	p {
		margin: 0 0 1.2rem;
		font-size: 1rem;
	}
	.row {
		justify-content: flex-end;
	}
</style>
