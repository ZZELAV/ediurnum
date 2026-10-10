<script lang="ts">
	import { t } from '$lib/i18n/t';

	let {
		value = $bindable(null),
		labelPrefix,
		name
	}: { value: number | null; labelPrefix: 'mood' | 'energy'; name: string } = $props();

	const steps = [1, 2, 3, 4, 5];
</script>

<div class="scale" role="radiogroup" aria-label={name}>
	{#each steps as n (n)}
		<button
			type="button"
			role="radio"
			aria-checked={value === n}
			class="step s{n}"
			class:on={value === n}
			onclick={() => (value = value === n ? null : n)}
		>
			<span class="dot" aria-hidden="true"></span>
			<span class="lbl">{t(`${labelPrefix}.${n}`)}</span>
		</button>
	{/each}
</div>

<style>
	.scale {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}
	.step {
		flex: 1 1 0;
		min-width: 3.6rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 0.2rem;
		background: none;
		border: 1px solid transparent;
		border-radius: 10px;
		cursor: pointer;
		color: var(--ink-soft);
		font: inherit;
		font-size: 0.75rem;
	}
	.step:hover {
		background: var(--paper-2);
	}
	.step.on {
		border-color: var(--paper-edge);
		background: var(--paper-2);
		color: var(--ink);
	}
	.dot {
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		border: 2px solid currentColor;
		opacity: 0.55;
		transition: transform 0.15s;
	}
	.on .dot {
		opacity: 1;
		transform: scale(1.12);
	}
	.s1 .dot { color: var(--mood-1); }
	.s2 .dot { color: var(--mood-2); }
	.s3 .dot { color: var(--mood-3); }
	.s4 .dot { color: var(--mood-4); }
	.s5 .dot { color: var(--mood-5); }
	.on.s1 .dot { background: var(--mood-1); }
	.on.s2 .dot { background: var(--mood-2); }
	.on.s3 .dot { background: var(--mood-3); }
	.on.s4 .dot { background: var(--mood-4); }
	.on.s5 .dot { background: var(--mood-5); }
</style>
