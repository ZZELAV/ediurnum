/**
 * Automatic locking after leaving the app (closing it, sending it to the background, locking the screen).
 *
 * The browser reports leaving via sendBeacon. If the app stays away longer than set, the server locks the
 * session – even if the app has been closed in the meantime. When coming back the page reports again
 * (or ends up at the sign-in). Several open tabs share their last activity via localStorage: while another
 * tab of the app is in use, coming back to this one doesn't lock.
 */
const STORAGE_KEY = 'ediurnum:last-activity';
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function watchAway(leaveMinutes: number): () => void {
	const leaveMs = Math.max(0, leaveMinutes) * 60_000;
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

	/** "Back again" for the server. */
	const ping = () => {
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
		if (now - lastStored > 5_000) store(now);
	};

	const close = async () => {
		if (closing) return;
		closing = true;
		await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
		location.href = '/login';
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
		ping();
		// switching between two tabs: the other tab's "left" message can arrive after this sign of life
		// – report once more shortly afterwards.
		clearTimeout(recheck);
		recheck = setTimeout(ping, 3_000);
	};

	const onVisibility = () => (document.visibilityState === 'hidden' ? onHidden() : onVisible());
	// back from the history cache (e.g. Safari): treat it like coming back
	const onPageShow = (e: PageTransitionEvent) => e.persisted && onVisible();

	for (const e of EVENTS) window.addEventListener(e, activity, { passive: true, capture: true });
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('pagehide', onHidden);
	window.addEventListener('pageshow', onPageShow);
	// on load, report that the app is in the foreground (again)
	if (document.visibilityState === 'visible') ping();

	return () => {
		for (const e of EVENTS) window.removeEventListener(e, activity, { capture: true });
		clearTimeout(recheck);
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pagehide', onHidden);
		window.removeEventListener('pageshow', onPageShow);
	};
}
