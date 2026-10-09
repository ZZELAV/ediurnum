/**
 * Automatisches Schliessen nach Inaktivität.
 *
 * Der Server beendet eine Sitzung, wenn länger als die eingestellte Zeit keine Anfrage kam.
 * Damit das Tagebuch auch auf dem Bildschirm geschlossen wird (und nicht offen stehen bleibt,
 * bis jemand klickt), zählt der Browser Eingaben, Klicks und Scrollen als Aktivität:
 * - aktiv → höchstens einmal pro Minute ein kurzes Lebenszeichen an den Server
 * - inaktiv länger als die eingestellte Zeit → Tagebuch schliessen und zur Anmeldung
 * Mehrere offene Tabs teilen sich die letzte Aktivität über localStorage.
 */
const STORAGE_KEY = 'ediurnum:last-activity';
const PING_EVERY_MS = 60_000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function watchIdle(idleMinutes: number): () => void {
	const idleMs = Math.max(5, idleMinutes) * 60_000;
	let last = Date.now();
	let lastPing = Date.now();
	let lastStored = 0;
	let closing = false;

	const readShared = () => {
		try {
			return Number(localStorage.getItem(STORAGE_KEY)) || 0;
		} catch {
			return 0;
		}
	};

	const activity = () => {
		const now = Date.now();
		last = now;
		if (now - lastStored > 5_000) {
			lastStored = now;
			try {
				localStorage.setItem(STORAGE_KEY, String(now));
			} catch {
				// ohne Speicher zählt nur dieser Tab
			}
		}
		if (now - lastPing > PING_EVERY_MS) {
			lastPing = now;
			fetch('/api/session', { method: 'GET', cache: 'no-store' })
				.then((res) => {
					if (res.status === 401) location.href = '/login';
				})
				.catch(() => {});
		}
	};

	const check = async () => {
		if (closing) return;
		const latest = Math.max(last, readShared());
		if (Date.now() - latest < idleMs) return;
		closing = true;
		await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
		location.href = '/login';
	};

	for (const e of EVENTS) window.addEventListener(e, activity, { passive: true, capture: true });
	const timer = setInterval(check, 15_000);
	// Nach dem Aufwachen (Laptop zugeklappt, Tab im Hintergrund) sofort prüfen
	const onVisible = () => document.visibilityState === 'visible' && check();
	document.addEventListener('visibilitychange', onVisible);

	return () => {
		for (const e of EVENTS) window.removeEventListener(e, activity, { capture: true });
		clearInterval(timer);
		document.removeEventListener('visibilitychange', onVisible);
	};
}
