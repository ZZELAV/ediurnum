import webpush from 'web-push';
import { ORIGIN, VAPID_SUBJECT } from '$app/env/private';
import { getDb, getMeta, nowIso, setMeta } from './db.ts';
import { listEntryMeta } from './entries.ts';
import { DEFAULT_LANG, isLocale, translate } from '#lib/i18n/index.ts';
import { todayIso } from '#lib/dates.ts';
import { randomUUID } from 'node:crypto';
import { log } from './log.ts';
import {
	defaultReminders,
	isFeelingsDue,
	isGrowthDue,
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
 * Reminders and push notifications.
 * Stored unencrypted on purpose: schedule, language, VAPID keys and the
 * push addresses of the devices. The messages never contain journal content.
 */

// ---------------------------------------------------------------- Schedule

export function loadReminders(): ReminderConfig {
	const raw = getMeta('reminders');
	if (!raw) return defaultReminders();
	const parsed = JSON.parse(raw) as Partial<ReminderConfig>;
	return sanitizeReminders(parsed, isLocale(parsed.lang) ? parsed.lang : DEFAULT_LANG);
}

export function saveReminders(cfg: ReminderConfig) {
	setMeta('reminders', JSON.stringify(cfg));
}

/**
 * New schedule of the reviews. If a review falls on today and its time has already passed,
 * it counts as sent today – otherwise the notification would arrive right after saving.
 */
export function saveReviewSchedule(cfg: ReminderConfig, now = new Date()) {
	saveReminders(cfg);
	const today = todayIso(now);
	const minutes = now.getHours() * 60 + now.getMinutes();
	if (now.getDay() === cfg.feelings.weekday && minutes >= minutesOf(cfg.feelings.time)) setMeta('reminder_sent_feelings', today);
	if (lastMonthlyDueOnOrBefore(today, cfg.growth.day) === today && minutes >= minutesOf(cfg.growth.time)) {
		setMeta('reminder_sent_growth', today);
	}
}

export function setReminderLang(lang: string) {
	saveReminders({ ...loadReminders(), lang });
}

// ---------------------------------------------------------------- Custom reminders

/** For each custom reminder, the day it was last sent. */
function sentMarkers(): Record<string, string> {
	const raw = getMeta('reminder_sent_custom');
	return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

function setSentMarkers(markers: Record<string, string>) {
	setMeta('reminder_sent_custom', JSON.stringify(markers));
}

/**
 * Creates a custom reminder or replaces an existing one (same ID).
 * If its time has already passed today, it counts as sent today –
 * otherwise the notification would arrive right after saving.
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

	markIfPassedToday(saved, now);
	return saved;
}

/** If the time has already passed today, the reminder counts as sent today (otherwise: reset). */
function markIfPassedToday(r: CustomReminder, now: Date) {
	const today = todayIso(now);
	const markers = sentMarkers();
	if (occursOn(r, today) && now.getHours() * 60 + now.getMinutes() >= minutesOf(r.time)) markers[r.id] = today;
	else delete markers[r.id];
	setSentMarkers(markers);
}

/** Switches on or off. Switched on after today's time, the reminder only comes the next time. */
export function setCustomReminderEnabled(id: string, enabled: boolean, now = new Date()) {
	const cfg = loadReminders();
	const r = cfg.custom.find((c) => c.id === id);
	if (!r) return;
	cfg.custom = cfg.custom.map((c) => (c.id === id ? { ...c, enabled } : c));
	saveReminders(cfg);
	if (enabled) markIfPassedToday(r, now);
}

export function deleteCustomReminder(id: string) {
	const cfg = loadReminders();
	cfg.custom = cfg.custom.filter((c) => c.id !== id);
	saveReminders(cfg);
	const markers = sentMarkers();
	delete markers[id];
	setSentMarkers(markers);
}


/** Custom reminders for display, sorted by next due date (past/paused at the end). */
export function listCustomReminders(now = new Date()): CustomReminderView[] {
	const today = todayIso(now);
	const minutes = now.getHours() * 60 + now.getMinutes();
	const rank = (r: CustomReminderView) => (r.enabled && r.next ? `0${r.next}${r.time}` : r.enabled ? '1' : '2');
	return loadReminders()
		.custom.map((r) => ({ ...r, next: nextOccurrence(r, today, minutes), today: occursOn(r, today) }))
		.sort((a, b) => rank(a).localeCompare(rank(b)) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- VAPID & devices

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
 * Sender for the push services (VAPID "subject"). Apple rejects addresses such as "localhost",
 * hence the public address from ORIGIN – or explicitly VAPID_SUBJECT (mailto: or https:).
 */
function vapidSubject(): string {
	if (VAPID_SUBJECT) return VAPID_SUBJECT;
	if (ORIGIN?.startsWith('https://')) return ORIGIN;
	return 'mailto:ediurnum@example.com';
}

/** Sends a notification to all devices. Expired devices are removed. */
export async function sendToAll(payload: { title: string; body: string; url: string; tag: string }): Promise<number> {
	const { publicKey, privateKey } = vapidKeys();
	const rows = getDb().prepare('SELECT endpoint, keys FROM push_subscriptions').all() as { endpoint: string; keys: string }[];
	let sent = 0;
	for (const r of rows) {
		try {
			await webpush.sendNotification({ endpoint: r.endpoint, keys: JSON.parse(r.keys) }, JSON.stringify(payload), {
				vapidDetails: { subject: vapidSubject(), publicKey, privateKey },
				TTL: 60 * 60 * 12,
				// "high": deliver immediately. With "normal" Apple (iOS) may hold the message back until the device
				// wakes up anyway – it then often only arrived when e.g. a VPN woke up the iPhone.
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

// ---------------------------------------------------------------- Scheduler

/** Checks once a minute whether a reminder is due. At most one message is sent per due day. */
async function reminderTick(now = new Date()) {
	if (listDevices().length === 0) return;
	const cfg = loadReminders();
	const today = todayIso(now);
	const minutes = now.getHours() * 60 + now.getMinutes();
	const metas = listEntryMeta();
	const t = (key: string) => translate(cfg.lang, key);

	if (
		cfg.feelings.enabled &&
		now.getDay() === cfg.feelings.weekday &&
		minutes >= minutesOf(cfg.feelings.time) &&
		getMeta('reminder_sent_feelings') !== today &&
		isFeelingsDue(today, metas, cfg)
	) {
		setMeta('reminder_sent_feelings', today);
		await sendToAll({ title: t('push.feelings.title'), body: t('push.feelings.body'), url: `/entry/${today}`, tag: 'feelings' });
	}

	if (
		cfg.growth.enabled &&
		lastMonthlyDueOnOrBefore(today, cfg.growth.day) === today &&
		minutes >= minutesOf(cfg.growth.time) &&
		getMeta('reminder_sent_growth') !== today &&
		isGrowthDue(today, metas, cfg)
	) {
		setMeta('reminder_sent_growth', today);
		await sendToAll({ title: t('push.growth.title'), body: t('push.growth.body'), url: `/entry/${today}`, tag: 'growth' });
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
