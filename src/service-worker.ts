/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Service Worker – nur für Push-Benachrichtigungen.
 * Bewusst ohne Offline-Cache: Tagebuchinhalte sollen nie im Browser-Cache landen.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; url?: string; tag?: string } = {};
	try {
		data = event.data?.json() ?? {};
	} catch {
		data = { body: event.data?.text() };
	}
	event.waitUntil(
		sw.registration.showNotification(data.title ?? 'ediurnum', {
			body: data.body ?? '',
			// PNG statt SVG: viele Systeme zeigen SVG in Benachrichtigungen nicht an
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			tag: data.tag,
			data: { url: data.url ?? '/' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL((event.notification.data?.url as string) ?? '/', sw.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const w of windows) {
				if (new URL(w.url).origin === sw.location.origin) {
					await w.focus();
					await (w as WindowClient).navigate(url);
					return;
				}
			}
			await sw.clients.openWindow(url);
		})()
	);
});
