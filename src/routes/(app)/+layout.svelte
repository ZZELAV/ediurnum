<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/t.ts';
	import PinBar from '#lib/components/PinBar.svelte';
	import { watchIdle } from '#lib/idle.ts';

	let { data, children } = $props();

	// Nach der eingestellten Zeit ohne Aktivität oder nach Verlassen der App sperrt sich das Tagebuch auch auf dem Bildschirm.
	$effect(() => watchIdle(data.sessionMinutes, data.leaveMinutes));

	// Service Worker (nur für Push, ohne Cache) früh registrieren – damit ist ediurnum
	// auch in Browsern installierbar, die dafür einen Service Worker verlangen.
	onMount(() => {
		if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
		navigator.serviceWorker
			.getRegistration('/')
			.then((existing) => existing ?? navigator.serviceWorker.register('/service-worker.js', { type: 'module' }))
			.catch(() => {});
	});

	const ENTRY_ROUTE = '/(app)/entry/[date]';

	// Wechsel zwischen zwei Tagen: Richtung bestimmen und View Transition starten.
	// Die Animation steht in app.css (Abschnitt "Wechsel zwischen Tagen").
	onNavigate((nav) => {
		const from = nav.from?.params?.date;
		const to = nav.to?.params?.date;
		if (
			!document.startViewTransition ||
			nav.from?.route.id !== ENTRY_ROUTE ||
			nav.to?.route.id !== ENTRY_ROUTE ||
			!from ||
			!to ||
			from === to ||
			matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			return;
		}
		const root = document.documentElement;
		root.dataset.flip = to > from ? 'forward' : 'backward';
		return new Promise<void>((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
			transition.finished.finally(() => delete root.dataset.flip);
		});
	});

	const links = [
		{ href: '/', key: 'nav.today', icon: 'today', match: (p: string) => p === '/' || p.startsWith('/entry') },
		{ href: '/archive', key: 'nav.archive', icon: 'calendar', match: (p: string) => p.startsWith('/archive') },
		{ href: '/insights', key: 'nav.insights', icon: 'spark', match: (p: string) => p.startsWith('/insights') },
		{ href: '/reminders', key: 'nav.reminders', icon: 'bell', match: (p: string) => p.startsWith('/reminders') },
		{ href: '/settings', key: 'nav.settings', icon: 'gear', match: (p: string) => p.startsWith('/settings') }
	];
</script>

{#snippet icon(name: string)}
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if name === 'today'}
			<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
		{:else if name === 'calendar'}
			<rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
		{:else if name === 'spark'}
			<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
		{:else if name === 'bell'}
			<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" />
		{:else if name === 'gear'}
			<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
		{:else if name === 'lock'}
			<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
		{/if}
	</svg>
{/snippet}

<a class="skip-link" href="#main">{t('nav.skip')}</a>

<div class="shell">
	<!-- Computer: Seitenleiste -->
	<aside class="sidebar">
		<a href="/" class="brand" aria-label="ediurnum">
			<span class="logo" aria-hidden="true">e</span>
			<span class="name">ediurnum</span>
		</a>
		<nav class="side-nav" aria-label={t('nav.today')}>
			{#each links as l (l.href)}
				{@const active = l.match(page.url.pathname)}
				<a href={l.href} class:active aria-current={active ? 'page' : undefined}>
					{@render icon(l.icon)}<span>{t(l.key)}</span>
				</a>
			{/each}
		</nav>
		<div class="side-foot">
			<form method="POST" action="/logout">
				<button class="lock-btn">{@render icon('lock')}<span>{t('nav.lock')}</span></button>
			</form>
			<p class="version">{t('footer.version', { version: data.version })}</p>
		</div>
	</aside>

	<!-- Handy: Kopfzeile -->
	<header class="mobile-top">
		<a href="/" class="brand" aria-label="ediurnum">
			<span class="logo" aria-hidden="true">e</span>
			<span class="name">ediurnum</span>
		</a>
		<form method="POST" action="/logout">
			<button class="btn quiet icon" title={t('nav.lock')} aria-label={t('nav.lock')}>{@render icon('lock')}</button>
		</form>
	</header>

	<div class="content">
		{#if data.pinUnlockedUntil > 0}
			<PinBar until={data.pinUnlockedUntil} />
		{/if}
		<main id="main" class="main">
			{@render children()}
		</main>
	</div>

	<!-- Handy: Navigation unten -->
	<nav class="tabbar" aria-label={t('nav.today')}>
		{#each links as l (l.href)}
			{@const active = l.match(page.url.pathname)}
			<a href={l.href} class:active aria-current={active ? 'page' : undefined}>
				{@render icon(l.icon)}<span>{t(l.key)}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	.shell {
		min-height: 100dvh;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		text-decoration: none;
		color: var(--ink);
	}
	.logo {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 10px;
		background: var(--accent);
		color: var(--paper);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.15rem;
		padding-bottom: 0.15rem;
	}
	.name {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.2rem;
	}
	.main {
		padding: clamp(1rem, 3vw, 2.5rem) clamp(1rem, 3vw, 2.5rem) 3rem;
	}

	/* ---------- Computer ---------- */
	.sidebar {
		position: fixed;
		inset: 0 auto 0 0;
		width: var(--sidebar-w);
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
		padding: 1.5rem 1rem 1.25rem;
		background: var(--paper);
		border-right: 1px solid var(--paper-edge);
	}
	.sidebar .brand {
		padding: 0 0.5rem;
	}
	.side-nav {
		display: grid;
		gap: 0.2rem;
	}
	.side-nav a,
	.lock-btn {
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		border-radius: 10px;
		color: var(--ink-soft);
		text-decoration: none;
		font: inherit;
		font-size: 0.95rem;
	}
	.side-nav a:hover,
	.lock-btn:hover {
		background: var(--paper-2);
		color: var(--ink);
	}
	.side-nav a.active {
		background: var(--accent-soft);
		color: var(--accent-strong);
		font-weight: 500;
	}
	.side-foot {
		margin-top: auto;
	}
	.lock-btn {
		white-space: nowrap;
		width: 100%;
		background: none;
		border: 0;
		cursor: pointer;
		text-align: left;
	}
	.version {
		margin: 0.5rem 0 0;
		padding: 0 0.75rem;
		font-size: 0.75rem;
		color: var(--ink-faint);
	}
	.content {
		margin-left: var(--sidebar-w);
	}
	.mobile-top,
	.tabbar {
		display: none;
	}

	/* ---------- Handy / Tablet ---------- */
	@media (max-width: 899px) {
		.sidebar {
			display: none;
		}
		.content {
			margin-left: 0;
			padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		}
		.mobile-top {
			position: sticky;
			top: 0;
			z-index: 20;
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0.55rem 1rem;
			padding-top: calc(0.55rem + env(safe-area-inset-top));
			background: color-mix(in srgb, var(--desk) 88%, transparent);
			backdrop-filter: blur(10px);
			border-bottom: 1px solid var(--paper-edge);
		}
		.mobile-top .name {
			font-size: 1.1rem;
		}
		.main {
			padding: 1rem 1rem 2rem;
		}
		.tabbar {
			position: fixed;
			inset: auto 0 0 0;
			z-index: 30;
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
			padding-bottom: env(safe-area-inset-bottom);
			background: var(--paper);
			border-top: 1px solid var(--paper-edge);
		}
		.tabbar a {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 0.2rem;
			font-size: 0.7rem;
			color: var(--ink-faint);
			text-decoration: none;
		}
		.tabbar a span {
			max-width: 100%;
			padding: 0 0.15rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.tabbar a.active {
			color: var(--accent-strong);
			font-weight: 600;
		}
	}
</style>
