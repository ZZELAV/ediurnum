<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/t';

	let { children, wide = false }: { children: Snippet; wide?: boolean } = $props();
</script>

<main class="cover-wrap" class:wide>
	<div class="card cover">
			<header class="brand">
				<span class="logo" aria-hidden="true">e</span>
				<div>
					<p class="title">ediurnum</p>
					<p class="tagline">{t('app.tagline')}</p>
				</div>
			</header>
			{@render children()}
	</div>
</main>

<style>
	/* Zentriert in der Fensterhöhe; Abstand als Innenabstand, damit nichts überläuft.
	   Unten etwas mehr Platz für das heraushängende Lesebändchen. */
	.cover-wrap {
		box-sizing: border-box;
		min-height: 100dvh;
		display: grid;
		align-content: center;
		justify-items: stretch;
		max-width: calc(480px + 2rem);
		margin: 0 auto;
		padding: 1.5rem 1rem;
	}
	.cover-wrap.wide {
		max-width: calc(640px + 2rem);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1.2rem;
		border-bottom: 1px solid var(--rule);
	}
	.logo {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 50%;
		background: var(--accent);
		color: var(--paper);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.5rem;
		line-height: 1;
		padding-bottom: 0.2rem;
	}
	.title {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.5rem;
		margin: 0;
		line-height: 1.1;
	}
	.tagline {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-faint);
	}
</style>
