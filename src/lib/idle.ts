/**
 * Automatic locking after inactivity and after leaving the app.
 *
 * The server ends a session when no request arrived for longer than the set time.
 * So that the journal is also locked on the screen (and doesn't stay open until
 * someone clicks), the browser counts typing, clicks and scrolling as activity:
 * - active → at most once a minute a short sign of life to the server
 * - inactive for longer than the set time → lock the journal and go to the sign-in
 * Several open tabs share the last activity via localStorage.
 *
 * Leaving the app (closing it, sending it to the background, locking the screen): the browser reports this via
 * sendBeacon. If the app stays away longer than set, the server locks the session – even if the
 * app has been closed in the meantime. When coming back the page reports again (or ends up at the sign-in).
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
			// without storage only this tab counts
		}
	};

	/** Sign of life; for the server it also means „back again“. */
	const ping = () => {
		lastPing = Date.now();
		fetch('/api/session', { method: 'GET', cache: 'no-store' })
			.then((res) => {
				if (res.status === 401) location.href = '/login';
			})
			.catch(() => {});
	};

	const activity = () => {
		// events of a hidden page (e.g. scrolling while switching away) don't count
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
		// away for longer than allowed (and no other tab was active in the meantime) → lock right away without waiting for the server
		if (leaveMs && away && Date.now() - Math.max(away, readShared()) > leaveMs) return close();
		check();
		if (closing) return;
		last = Date.now();
		ping();
		// switching between two tabs: the other tab's „left“ message can arrive after this sign of life
		// – report once more shortly afterwards.
		clearTimeout(recheck);
		recheck = setTimeout(ping, 3_000);
	};

	const onVisibility = () => (document.visibilityState === 'hidden' ? onHidden() : onVisible());
	// back from the history cache (e.g. Safari): treat it like coming back
	const onPageShow = (e: PageTransitionEvent) => e.persisted && onVisible();

	for (const e of EVENTS) window.addEventListener(e, activity, { passive: true, capture: true });
	const timer = setInterval(check, 15_000);
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('pagehide', onHidden);
	window.addEventListener('pageshow', onPageShow);
	// on load, report that the app is in the foreground (again)
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
