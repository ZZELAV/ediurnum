import webpush from 'web-push';
import { ORIGIN, VAPID_SUBJECT } from '$app/env/private';
import { getDb, getMeta, nowIso, setMeta } from './db';
import { listEntryMeta } from './entries';
import { isLang, translate } from '#lib/i18n/index.ts';
import { todayIso } from '#lib/dates.ts';
import { randomUUID } from 'node:crypto';
import { log } from './log';
import {
	defaultReminders,
	isGefuehlDue,
	isWachstumDue,
	lastMonthlyDueOnOrBefore,
	MAX_CUSTOM_REMINDERS,
	minutesOf,
	nextOccurrence,
	occursOn,
	sanitizeCustomReminder,
	sanitizeReminders,
	type CustomReminder,
	type CustomReminderError,
	type CustomReminderView,
	type ReminderConfig
} from '#lib/reminders.ts';
import type { Lang } from '#lib/types.ts';

/**
 * Erinnerungen und Push-Benachrichtigungen.
 * Bewusst unverschlüsselt gespeichert: Zeitplan, Sprache, VAPID-Schlüssel und die
 * Push-Adressen der Geräte. Die Nachrichten enthalten nie Tagebuchinhalte.
 */

// ---------------------------------------------------------------- Zeitplan

export function loadReminders(): ReminderConfig {
	const raw = getMeta('reminders');
	if (!raw) return defaultReminders();
	const parsed = JSON.parse(raw) as Partial<ReminderConfig>;
	return sanitizeReminders(parsed, isLang(parsed.lang) ? parsed.lang : 'de');
}

export function saveReminders(cfg: ReminderConfig) {
	setMeta('reminders', JSON.stringify(cfg));
}

export function setReminderLang(lang: Lang) {
	saveReminders({ ...loadReminders(), lang });
}

// ---------------------------------------------------------------- Eigene Erinnerungen

/** Pro eigener Erinnerung der Tag, an dem zuletzt gesendet wurde. */
function sentMarkers(): Record<string, string> {
	const raw = getMeta('reminder_sent_custom');
	return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

function setSentMarkers(markers: Record<string, string>) {
	setMeta('reminder_sent_custom', JSON.stringify(markers));
}

/**
 * Legt eine eigene Erinnerung an oder ersetzt eine bestehende (gleiche ID).
 * Ist die Uhrzeit heute schon vorbei, gilt sie für heute als gesendet –
 * sonst käme die Benachrichtigung sofort nach dem Speichern.
 */
export function saveCustomReminder(input: unknown, now = new Date()): CustomReminder | CustomReminderError {
	const r = sanitizeCustomReminder(input);
	if (typeof r === 'string') return r;
	const cfg = loadReminders();
	const existing = cfg.custom.find((c) => c.id === r.id);
	if (!existing && cfg.custom.length >= MAX_CUSTOM_REMINDERS) return 'reminders.errorLimit';
	const saved: CustomReminder = { ...r, id: existing?.id ?? randomUUID(), createdAt: existing?.createdAt ?? nowIso() };
	cfg.custom = existing ? cfg.custom.map((c) => (c.id === saved.id ? saved : c)) : [...cfg.custom, saved];
	saveReminders(cfg);

	const today = todayIso(now);
	const markers = sentMarkers();
	if (occursOn(saved, today) && now.getHours() * 60 + now.getMinutes() >= minutesOf(saved.time)) markers[saved.id] = today;
	else delete markers[saved.id];
	setSentMarkers(markers);
	return saved;
}

export function setCustomReminderEnabled(id: string, enabled: boolean) {
	const cfg = loadReminders();
	cfg.custom = cfg.custom.map((c) => (c.id === id ? { ...c, enabled } : c));
	saveReminders(cfg);
}

export function deleteCustomReminder(id: string) {
	const cfg = loadReminders();
	cfg.custom = cfg.custom.filter((c) => c.id !== id);
	saveReminders(cfg);
	const markers = sentMarkers();
	delete markers[id];
	setSentMarkers(markers);
}


/** Eigene Erinnerungen für die Anzeige, nach nächster Fälligkeit sortiert (vorbei/pausiert am Schluss). */
export function listCustomReminders(now = new Date()): CustomReminderView[] {
	const today = todayIso(now);
	const minutes = now.getHours() * 60 + now.getMinutes();
	const rank = (r: CustomReminderView) => (r.enabled && r.next ? `0${r.next}${r.time}` : r.enabled ? '1' : '2');
	return loadReminders()
		.custom.map((r) => ({ ...r, next: nextOccurrence(r, today, minutes), today: occursOn(r, today) }))
		.sort((a, b) => rank(a).localeCompare(rank(b)) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- VAPID & Geräte

function vapidKeys(): { publicKey: string; privateKey: string } {
	const raw = getMeta('vapid');
	if (raw) return JSON.parse(raw);
	const keys = webpush.generateVAPIDKeys();
	setMeta('vapid', JSON.stringify(keys));
	return keys;
}

export function vapidPublicKey(): string {
	return vapidKeys().publicKey;
}

export interface PushDevice {
	endpoint: string;
	label: string;
	createdAt: string;
}

export function listDevices(): PushDevice[] {
	return (
		getDb().prepare('SELECT endpoint, label, created_at FROM push_subscriptions ORDER BY created_at').all() as {
			endpoint: string;
			label: string;
			created_at: string;
		}[]
	).map((r) => ({ endpoint: r.endpoint, label: r.label, createdAt: r.created_at }));
}

export function addDevice(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, label: string) {
	getDb()
		.prepare('INSERT OR REPLACE INTO push_subscriptions (endpoint, keys, label, created_at) VALUES (?, ?, ?, ?)')
		.run(sub.endpoint, JSON.stringify(sub.keys), label.slice(0, 80), nowIso());
}

export function removeDevice(endpoint: string) {
	getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function removeAllDevices() {
	getDb().prepare('DELETE FROM push_subscriptions').run();
}

/**
 * Absender für die Push-Dienste (VAPID „subject“). Apple lehnt Adressen wie „localhost“ ab,
 * deshalb die öffentliche Adresse aus ORIGIN – oder ausdrücklich VAPID_SUBJECT (mailto: oder https:).
 */
function vapidSubject(): string {
	if (VAPID_SUBJECT) return VAPID_SUBJECT;
	if (ORIGIN?.startsWith('https://')) return ORIGIN;
	return 'mailto:ediurnum@example.com';
}

/** Sendet eine Benachrichtigung an alle Geräte. Abgelaufene Geräte werden entfernt. */
export async function sendToAll(payload: { title: string; body: string; url: string; tag: string }): Promise<number> {
	const { publicKey, privateKey } = vapidKeys();
	const rows = getDb().prepare('SELECT endpoint, keys FROM push_subscriptions').all() as { endpoint: string; keys: string }[];
	let sent = 0;
	for (const r of rows) {
		try {
			await webpush.sendNotification({ endpoint: r.endpoint, keys: JSON.parse(r.keys) }, JSON.stringify(payload), {
				vapidDetails: { subject: vapidSubject(), publicKey, privateKey },
				TTL: 60 * 60 * 12,
				// „high“: sofort zustellen. Bei „normal“ darf Apple (iOS) die Nachricht zurückhalten, bis das Gerät
				// ohnehin aufwacht – sie kam dann oft erst an, wenn z. B. ein VPN das iPhone geweckt hat.
				urgency: 'high'
			});
			sent++;
		} catch (e) {
			const status = (e as { statusCode?: number }).statusCode;
			if (status === 404 || status === 410) {
				removeDevice(r.endpoint);
				log.info('push device expired and removed');
			}
			else log.error('push failed', { status: status ?? (e as Error).message, body: (e as { body?: string }).body ?? '' });
		}
	}
	log.info('push sent', { tag: payload.tag.replace(/^custom-.*/, 'custom'), devices: sent, of: rows.length });
	return sent;
}

// ---------------------------------------------------------------- Planer

/** Prüft einmal pro Minute, ob eine Erinnerung fällig ist. Pro Fälligkeitstag wird höchstens einmal gesendet. */
export async function reminderTick(now = new Date()) {
	if (listDevices().length === 0) return;
	const cfg = loadReminders();
	const today = todayIso(now);
	const minutes = now.getHours() * 60 + now.getMinutes();
	const metas = listEntryMeta();
	const t = (key: string) => translate(cfg.lang, key);

	if (
		cfg.gefuehl.enabled &&
		now.getDay() === cfg.gefuehl.weekday &&
		minutes >= minutesOf(cfg.gefuehl.time) &&
		getMeta('reminder_sent_gefuehl') !== today &&
		isGefuehlDue(today, metas, cfg)
	) {
		setMeta('reminder_sent_gefuehl', today);
		await sendToAll({ title: t('push.gefuehl.title'), body: t('push.gefuehl.body'), url: `/entry/${today}`, tag: 'gefuehl' });
	}

	if (
		cfg.wachstum.enabled &&
		lastMonthlyDueOnOrBefore(today, cfg.wachstum.day) === today &&
		minutes >= minutesOf(cfg.wachstum.time) &&
		getMeta('reminder_sent_wachstum') !== today &&
		isWachstumDue(today, metas, cfg)
	) {
		setMeta('reminder_sent_wachstum', today);
		await sendToAll({ title: t('push.wachstum.title'), body: t('push.wachstum.body'), url: `/entry/${today}`, tag: 'wachstum' });
	}

	const markers = sentMarkers();
	const due = cfg.custom.filter(
		(r) => r.enabled && occursOn(r, today) && minutes >= minutesOf(r.time) && markers[r.id] !== today
	);
	if (due.length === 0) return;
	for (const r of due) markers[r.id] = today;
	setSentMarkers(markers);
	for (const r of due) {
		await sendToAll({ title: r.title, body: r.body, url: '/reminders', tag: `custom-${r.id}` });
	}
}

const globalKey = Symbol.for('ediurnum.reminderTimer');

export function startReminderScheduler() {
	const g = globalThis as unknown as Record<symbol, ReturnType<typeof setInterval> | undefined>;
	if (g[globalKey]) clearInterval(g[globalKey]);
	const run = () => reminderTick().catch((e) => log.error('reminder check failed', { error: (e as Error).message }));
	g[globalKey] = setInterval(run, 60_000);
	g[globalKey].unref?.();
	setTimeout(run, 5_000).unref?.();
}
