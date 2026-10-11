<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { ask } from '#lib/confirm.svelte.ts';
	import { refreshAll } from '$app/navigation';
	import { api } from '#lib/client.ts';
	import { Flash } from '#lib/flash.svelte.ts';
	import { t } from '#lib/i18n/t.ts';

	interface Props {
		push: { publicKey: string; devices: { endpoint: string; label: string; createdAt: string }[] };
	}
	let { push }: Props = $props();

	// ---- Push auf diesem Gerät ----
	type PushState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';
	let pushState = $state<PushState>('loading');
	let endpoint = $state<string | null>(null);
	let busy = $state(false);
	const pushMessage = new Flash();

	const registered = $derived(endpoint !== null && push.devices.some((d) => d.endpoint === endpoint));

	function isIos() {
		return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	}
	function isStandalone() {
		return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
	}

	function deviceLabel(): string {
		const ua = navigator.userAgent;
		const os = /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
		const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
		return [os, browser].filter(Boolean).join(' · ') || 'Browser';
	}

	function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
		const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
		const raw = atob(padded);
		const out = new Uint8Array(new ArrayBuffer(raw.length));
		for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
		return out;
	}

	async function registration(): Promise<ServiceWorkerRegistration> {
		const existing = await navigator.serviceWorker.getRegistration('/');
		if (!existing) await navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
		return navigator.serviceWorker.ready;
	}

	async function refresh() {
		if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
			pushState = isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') {
			pushState = 'denied';
			return;
		}
		const reg = await registration();
		const sub = await reg.pushManager.getSubscription();
		endpoint = sub?.endpoint ?? null;
		pushState = sub ? 'on' : 'off';
	}

	onMount(() => {
		refresh().catch(() => (pushState = 'unsupported'));
	});

	async function enable() {
		busy = true;
		pushMessage.clear();
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				pushState = permission === 'denied' ? 'denied' : 'off';
				return;
			}
			const reg = await registration();
			const sub =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(push.publicKey) }));
			const res = await api('/api/push', 'POST', { subscription: sub.toJSON(), label: deviceLabel() });
			if (!res.ok) throw new Error(res.error);
			endpoint = sub.endpoint;
			pushState = 'on';
			await refreshAll();
		} catch (e) {
			pushMessage.show(t('common.error') + ' ' + (e as Error).message, 'error');
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		try {
			const reg = await registration();
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await api('/api/push', 'DELETE', { endpoint: sub.endpoint });
				await sub.unsubscribe();
			}
			endpoint = null;
			pushState = 'off';
			await refreshAll();
		} finally {
			busy = false;
		}
	}

	async function sendTest() {
		busy = true;
		const res = await api<{ sent: number }>('/api/push/test', 'POST', {});
		busy = false;
		if (res.ok) pushMessage.show(t('settings.pushTestSent', { count: res.data.sent }));
		else pushMessage.show(t(res.error), 'error');
	}

	async function removeAll() {
		if (!(await ask(t('settings.pushRemoveAll') + '?', { danger: true }))) return;
		await api('/api/push', 'DELETE', { all: true });
		await disable();
	}
</script>

<p class="faint">{t('settings.pushIntro')}</p>

{#if pushState === 'unsupported'}
	<p class="notice info">{t('settings.pushUnsupported')}</p>
{:else if pushState === 'ios-install'}
	<p class="notice info">{t('settings.pushIos')}</p>
{:else if pushState === 'denied'}
	<p class="notice error">{t('settings.pushDenied')}</p>
{:else if pushState !== 'loading'}
	<div class="row">
		{#if pushState === 'on' && registered}
			<span class="chip">✓ {t('settings.pushActive')}</span>
			<button type="button" class="btn ghost small" onclick={disable} disabled={busy}>{t('settings.pushDisable')}</button>
		{:else}
			<button type="button" class="btn" onclick={enable} disabled={busy}>{t('settings.pushEnable')}</button>
		{/if}
		{#if push.devices.length > 0}
			<button type="button" class="btn ghost small" onclick={sendTest} disabled={busy}>{t('settings.pushTest')}</button>
		{/if}
	</div>
{/if}
{#if pushMessage.current}<p class="faint push-msg" role="status" out:fade>{pushMessage.current.text}</p>{/if}

<div class="devices">
	{#if push.devices.length === 0}
		<p class="faint">{t('settings.pushNone')}</p>
	{:else}
		<p class="faint">{t('settings.pushDevices', { count: push.devices.length })}</p>
		<ul>
			{#each push.devices as d (d.endpoint)}
				<li>
					{d.label || 'Browser'}
					{#if d.endpoint === endpoint}<span class="chip">{t('settings.pushThisDevice')}</span>{/if}
				</li>
			{/each}
		</ul>
		<button type="button" class="btn danger small" onclick={removeAll}>{t('settings.pushRemoveAll')}</button>
	{/if}
</div>

<style>
	.push-msg {
		margin-top: 0.6rem;
	}
	.devices {
		margin-top: 1rem;
	}
	.devices ul {
		margin: 0 0 0.75rem;
		padding-left: 1.2rem;
	}
	.devices li .chip {
		margin-left: 0.4rem;
	}
</style>
