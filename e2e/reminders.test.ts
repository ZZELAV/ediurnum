/**
 * Bereich 5: Erinnerungen und Push – Geräte, Versand (über einen Schein-Push-Dienst), Planer, Zeitplan.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client, setupJournal, startServer, type TestServer } from './helpers.ts';
import { startPushService, type FakePushService } from './push-service.ts';

let push: FakePushService;
let server: TestServer;
let c: Client;
const env = { NODE_TLS_REJECT_UNAUTHORIZED: '0' };

/** Jetzt in Zürich: Datum und Uhrzeit (HH:MM) – wie der Planer rechnet (TZ=Europe/Zurich). */
function zurichNow() {
	const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
	const [date, time] = parts.split(' ');
	return { date, time };
}

function db() {
	return new DatabaseSync(join(server.dataDir, 'ediurnum.db'));
}

function readMeta(key: string): string | null {
	const d = db();
	const row = d.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
	d.close();
	return row?.value ?? null;
}

function deviceCount(): number {
	const d = db();
	const n = (d.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as { n: number }).n;
	d.close();
	return n;
}

/** Eigene Erinnerung direkt in den Zeitplan schreiben (ohne „heute schon gesendet“-Markierung). */
function writeCustom(reminder: Record<string, unknown>) {
	const d = db();
	const cfg = JSON.parse((d.prepare(`SELECT value FROM meta WHERE key = 'reminders'`).get() as { value: string }).value);
	cfg.custom = [{ id: 'r1', title: 'Wasser trinken', body: 'Ein Glas', enabled: true, repeat: 'daily', date: '', weekdays: [], day: 1, createdAt: '', ...reminder }];
	d.prepare(`UPDATE meta SET value = ? WHERE key = 'reminders'`).run(JSON.stringify(cfg));
	d.prepare(`DELETE FROM meta WHERE key = 'reminder_sent_custom'`).run();
	d.close();
}

/** Server neu starten (gleiche Daten): Der Planer prüft 5 Sekunden nach dem Start. */
async function restart() {
	await server.stop({ keepData: true });
	server = await startServer(env, { dataDir: server.dataDir });
}

before(async () => {
	push = await startPushService();
	server = await startServer(env);
	({ client: c } = await setupJournal(server));
});
after(async () => {
	await server.stop();
	await push.close();
});

describe('Geräte', () => {
	test('anmelden; ungültige Adressen und ohne Anmeldung abgelehnt', async () => {
		const dev = push.device('/push/phone');
		assert.equal((await c.api('/api/push', { subscription: dev.subscription, label: 'iPhone' })).status, 200);
		assert.equal(deviceCount(), 1);
		assert.match(server.output(), /push device registered service=127\.0\.0\.1/);
		const bad = { ...dev.subscription, endpoint: 'http://127.0.0.1/x' };
		assert.equal((await c.api('/api/push', { subscription: bad })).status, 400);
		assert.equal((await c.api('/api/push', { subscription: { endpoint: 'https://x' } })).status, 400);
		assert.equal((await new Client(server.url).api('/api/push', { subscription: dev.subscription })).status, 401);
		assert.equal(deviceCount(), 1);
		// gleiche Adresse nochmals: kein zweites Gerät
		await c.api('/api/push', { subscription: dev.subscription, label: 'iPhone' });
		assert.equal(deviceCount(), 1);
	});

	test('Testbenachrichtigung: verschlüsselt, dringend, ohne Tagebuchinhalt', async () => {
		push.messages.length = 0;
		const r = await c.api('/api/push/test', {});
		assert.equal(r.json.sent, 1);
		const [m] = await push.waitFor(1);
		assert.deepEqual(m.payload, { title: 'ediurnum', body: 'Benachrichtigungen funktionieren.', url: '/reminders#push', tag: 'test' });
		assert.equal(m.headers['urgency'], 'high');
		assert.equal(m.headers['ttl'], String(60 * 60 * 12));
		assert.equal(m.headers['content-encoding'], 'aes128gcm');
		assert.match(String(m.headers['authorization']), /^vapid t=.+, k=.+/);
	});

	test('abgelaufenes Gerät wird entfernt, Fehler beim Dienst nur protokolliert', async () => {
		const gone = push.device('/push/gone');
		const broken = push.device('/push/broken');
		push.status.set('/push/gone', 410);
		push.status.set('/push/broken', 500);
		await c.api('/api/push', { subscription: gone.subscription });
		await c.api('/api/push', { subscription: broken.subscription });
		assert.equal(deviceCount(), 3);
		const r = await c.api('/api/push/test', {});
		assert.equal(r.json.sent, 1);
		assert.equal(deviceCount(), 2, 'abgelaufenes entfernt, fehlerhaftes bleibt');
		assert.match(server.output(), /push device expired and removed/);
		assert.match(server.output(), /push failed status=500/);
		await c.api('/api/push', { endpoint: broken.subscription.endpoint }, 'DELETE');
		assert.equal(deviceCount(), 1);
	});
});

describe('Planer', () => {
	test('eigene Erinnerung wird zur eingestellten Zeit genau einmal gesendet', async () => {
		const { date, time } = zurichNow();
		writeCustom({ time });
		push.messages.length = 0;
		await restart();
		const [m] = await push.waitFor(1);
		assert.ok(m, 'Erinnerung gesendet');
		assert.deepEqual(m.payload, { title: 'Wasser trinken', body: 'Ein Glas', url: '/reminders', tag: 'custom-r1' });
		assert.equal(JSON.parse(readMeta('reminder_sent_custom')!).r1, date);
		assert.match(server.output(), /push sent tag=custom devices=1 of=1/);
		// Neustart am selben Tag: nicht nochmals
		push.messages.length = 0;
		await restart();
		assert.equal((await push.waitFor(1, 8_000)).length, 0);
	});

	test('Einschalten nach der Uhrzeit sendet nicht sofort', async () => {
		writeCustom({ time: '00:00', enabled: false });
		({ client: c } = await login());
		const r = await c.action('/reminders?/toggle', { id: 'r1', enabled: 'true' });
		assert.equal(r.type, 'success');
		push.messages.length = 0;
		await restart();
		assert.equal((await push.waitFor(1, 8_000)).length, 0, 'erst wieder morgen');
	});

	test('neue Erinnerung mit vergangener Uhrzeit sendet nicht sofort', async () => {
		({ client: c } = await login());
		const r = await c.action('/reminders?/save', { title: 'Neu', body: '', repeat: 'daily', time: '00:00' });
		assert.equal(r.type, 'success');
		push.messages.length = 0;
		await restart();
		assert.equal((await push.waitFor(1, 8_000)).length, 0);
	});

	test('ohne Geräte wird nichts gesendet', async () => {
		({ client: c } = await login());
		await c.api('/api/push', { all: true }, 'DELETE');
		assert.equal(deviceCount(), 0);
		const { time } = zurichNow();
		writeCustom({ time });
		await restart();
		await new Promise((r) => setTimeout(r, 7_000));
		assert.doesNotMatch(server.output(), /push sent/);
		assert.equal(readMeta('reminder_sent_custom'), null, 'bleibt offen, bis ein Gerät da ist');
	});
});

describe('Zeitplan der Rückblicke', () => {
	test('speichern, ungültige Werte auf Standard, Rückblick für heute nach der Uhrzeit gilt als gesendet', async () => {
		({ client: c } = await login());
		const weekday = new Date(zurichNow().date + 'T00:00:00Z').getUTCDay();
		const r = await c.action('/reminders?/reviews', {
			gefuehlEnabled: 'on',
			gefuehlWeekday: String(weekday),
			gefuehlTime: '00:00',
			wachstumEnabled: 'on',
			wachstumDay: '99',
			wachstumTime: '25:00'
		});
		assert.equal(r.type, 'success');
		const cfg = JSON.parse(readMeta('reminders')!);
		assert.deepEqual(cfg.gefuehl, { enabled: true, weekday, time: '00:00' });
		assert.deepEqual(cfg.wachstum, { enabled: true, day: 'last', time: '19:00' });
		assert.equal(readMeta('reminder_sent_gefuehl'), zurichNow().date);
	});

	test('Seite zeigt die Erinnerungen', async () => {
		const html = await (await c.get('/reminders')).text();
		assert.match(html, /Wasser trinken/);
		assert.equal((await new Client(server.url).get('/reminders')).status, 303);
	});
});

async function login() {
	const client = new Client(server.url);
	const r = await client.action('/login', { password: 'e2e-Passwort-lang-genug' });
	if (r.type !== 'redirect' && r.type !== 'success') throw new Error('Anmeldung fehlgeschlagen: ' + JSON.stringify(r));
	return { client };
}
