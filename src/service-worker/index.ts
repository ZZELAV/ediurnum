import { self as sw } from '$app/service-worker';

/**
 * Service worker – only for push notifications.
 * Deliberately without an offline cache: journal content must never end up in the browser cache.
 */
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
			// PNG instead of SVG: many systems don't show SVG in notifications
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
