/**
 * Automatisches Sperren nach Inaktivität und nach Verlassen der App.
 *
 * Der Server beendet eine Sitzung, wenn länger als die eingestellte Zeit keine Anfrage kam.
 * Damit das Tagebuch auch auf dem Bildschirm gesperrt wird (und nicht offen stehen bleibt,
 * bis jemand klickt), zählt der Browser Eingaben, Klicks und Scrollen als Aktivität:
 * - aktiv → höchstens einmal pro Minute ein kurzes Lebenszeichen an den Server
 * - inaktiv länger als die eingestellte Zeit → Tagebuch sperren und zur Anmeldung
 * Mehrere offene Tabs teilen sich die letzte Aktivität über localStorage.
 *
 * Verlassen der App (schliessen, in den Hintergrund, Bildschirm sperren): Der Browser meldet das per
 * sendBeacon. Bleibt die App länger weg als eingestellt, sperrt der Server die Sitzung – auch wenn die
 * App inzwischen beendet wurde. Beim Zurückkommen meldet sich die Seite wieder (oder landet bei der Anmeldung).
 */
const STORAGE_KEY = 'ediurnum:last-activity';
const PING_EVERY_MS = 60_000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function watchIdle(idleMinutes: number, leaveMinutes = 0): () => void {
	const idleMs = Math.max(5, idleMinutes) * 60_000;
	const leaveMs = Math.max(0, leaveMinutes) * 60_000;
	let last = Date.now();
	let lastPing = Date.now();
	let lastStored = 0;
	let hiddenAt = 0;
	let closing = false;
	let recheck: ReturnType<typeof setTimeout> | undefined;

	const readShared = () => {
		try {
			return Number(localStorage.getItem(STORAGE_KEY)) || 0;
		} catch {
			return 0;
		}
	};

	const store = (now: number) => {
		lastStored = now;
		try {
			localStorage.setItem(STORAGE_KEY, String(now));
		} catch {
			// ohne Speicher zählt nur dieser Tab
		}
	};

	/** Lebenszeichen; gilt beim Server zugleich als „wieder da“. */
	const ping = () => {
		lastPing = Date.now();
		fetch('/api/session', { method: 'GET', cache: 'no-store' })
			.then((res) => {
				if (res.status === 401) location.href = '/login';
			})
			.catch(() => {});
	};

	const activity = () => {
		// Ereignisse einer verborgenen Seite (z. B. Scrollen beim Wegwechseln) zählen nicht
		if (hiddenAt) return;
		const now = Date.now();
		last = now;
		if (now - lastStored > 5_000) store(now);
		if (now - lastPing > PING_EVERY_MS) ping();
	};

	const close = async () => {
		if (closing) return;
		closing = true;
		await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
		location.href = '/login';
	};

	const check = () => {
		if (Date.now() - Math.max(last, readShared()) >= idleMs) close();
	};

	const onHidden = () => {
		if (!leaveMs || closing || hiddenAt) return;
		hiddenAt = Date.now();
		store(hiddenAt);
		navigator.sendBeacon?.('/api/session');
	};

	const onVisible = () => {
		const away = hiddenAt;
		hiddenAt = 0;
		// Länger weg als erlaubt (und kein anderer Tab war inzwischen aktiv) → sofort sperren, ohne auf den Server zu warten
		if (leaveMs && away && Date.now() - Math.max(away, readShared()) > leaveMs) return close();
		check();
		if (closing) return;
		last = Date.now();
		ping();
		// Wechsel zwischen zwei Tabs: Die Meldung „verlassen“ des anderen Tabs kann nach diesem Lebenszeichen
		// ankommen – kurz darauf noch einmal melden.
		clearTimeout(recheck);
		recheck = setTimeout(ping, 3_000);
	};

	const onVisibility = () => (document.visibilityState === 'hidden' ? onHidden() : onVisible());
	// Zurück aus dem Verlauf-Cache (z. B. Safari): wie ein Zurückkommen behandeln
	const onPageShow = (e: PageTransitionEvent) => e.persisted && onVisible();

	for (const e of EVENTS) window.addEventListener(e, activity, { passive: true, capture: true });
	const timer = setInterval(check, 15_000);
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('pagehide', onHidden);
	window.addEventListener('pageshow', onPageShow);
	// Beim Laden melden, dass die App (wieder) im Vordergrund ist
	if (document.visibilityState === 'visible') ping();

	return () => {
		for (const e of EVENTS) window.removeEventListener(e, activity, { capture: true });
		clearInterval(timer);
		clearTimeout(recheck);
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pagehide', onHidden);
		window.removeEventListener('pageshow', onPageShow);
	};
}
