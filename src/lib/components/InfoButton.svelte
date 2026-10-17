<script lang="ts">
	import { t } from '#lib/i18n/t.ts';

	/**
	 * Small "i" with a tooltip right next to it: appears on hover and keyboard focus, a click or tap keeps it open
	 * (phones have no hover). Escape, a click elsewhere, scrolling or resizing close it. Placed with fixed
	 * coordinates and kept inside the window, so it never makes the page wider (iPhone, 320 px).
	 */
	let { text }: { text: string } = $props();

	const id = $props.id();
	const GAP = 6;
	const MARGIN = 8;

	let button = $state<HTMLButtonElement>();
	let tip = $state<HTMLDivElement>();
	let hovered = $state(false);
	let focused = $state(false);
	let pinned = $state(false);
	let pos = $state({ left: 0, top: 0 });
	const open = $derived(pinned || hovered || focused);

	/** Right of the icon if there is room, otherwise below it; always inside the window. */
	function place() {
		if (!button || !tip) return;
		const b = button.getBoundingClientRect();
		const w = tip.offsetWidth;
		const h = tip.offsetHeight;
		const right = b.right + GAP;
		if (right + w <= innerWidth - MARGIN) {
			pos = { left: right, top: Math.max(MARGIN, Math.min(b.top + b.height / 2 - h / 2, innerHeight - h - MARGIN)) };
		} else {
			pos = { left: Math.max(MARGIN, Math.min(b.left, innerWidth - w - MARGIN)), top: b.bottom + GAP };
		}
	}

	$effect(() => {
		if (!open) return;
		place();
		const close = () => {
			pinned = hovered = false;
			button?.blur();
		};
		const outside = (e: PointerEvent) => {
			if (!button?.contains(e.target as Node) && !tip?.contains(e.target as Node)) close();
		};
		const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', key);
		addEventListener('scroll', close, { passive: true, capture: true });
		addEventListener('resize', close);
		return () => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', key);
			removeEventListener('scroll', close, { capture: true });
			removeEventListener('resize', close);
		};
	});
</script>

<span class="wrap">
	<button
		bind:this={button}
		type="button"
		class="info"
		aria-label={t('common.moreInfo')}
		aria-describedby={id}
		class:active={open}
		onclick={() => (pinned = !pinned)}
		onpointerenter={(e) => e.pointerType === 'mouse' && (hovered = true)}
		onpointerleave={(e) => e.pointerType === 'mouse' && (hovered = false)}
		onfocus={() => (focused = !!button?.matches(':focus-visible'))}
		onblur={() => (focused = false)}
	>
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<circle cx="8" cy="8" r="6.6" />
			<path d="M8 7.2v4" />
			<circle cx="8" cy="4.9" r="0.4" />
		</svg>
	</button>
	<div bind:this={tip} {id} role="tooltip" class="tip" class:open style:left="{pos.left}px" style:top="{pos.top}px">{text}</div>
</span>

<style>
	.wrap {
		display: inline-flex;
	}
	.info {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		margin: -0.35rem 0;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--ink-faint);
		cursor: pointer;
	}
	.info:hover,
	.info.active {
		color: var(--accent);
	}
	svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.tip {
		position: fixed;
		z-index: 50;
		width: max-content;
		max-width: min(20rem, calc(100vw - 16px));
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 10px;
		background: var(--paper);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		color: var(--ink-soft);
		font-size: 0.85rem;
		line-height: 1.45;
		/* hidden but measurable, so the position can be computed before it appears */
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s ease;
	}
	.tip.open {
		visibility: visible;
		opacity: 1;
		pointer-events: auto;
	}
</style>
