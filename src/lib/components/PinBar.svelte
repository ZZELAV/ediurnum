<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '$lib/client';
	import { fmtTime, t } from '$lib/i18n/t';

	let { until }: { until: number } = $props();

	$effect(() => {
		const ms = until - Date.now();
		if (ms <= 0) return;
		const timer = setTimeout(() => invalidateAll(), ms + 500);
		return () => clearTimeout(timer);
	});

	async function relock() {
		await api('/api/pin', 'DELETE');
		await invalidateAll();
	}
</script>

<div class="pinbar" role="status">
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>
	<span>{t('pin.unlockedUntil', { time: fmtTime(until) })}</span>
	<button class="btn quiet small" onclick={relock}>{t('pin.relock')}</button>
</div>

<style>
	.pinbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		padding: 0.25rem 1rem;
		background: color-mix(in srgb, var(--gold) 20%, var(--desk));
		color: var(--ink);
	}
</style>
