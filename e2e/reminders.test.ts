/**
 * Area 5: reminders and push – devices, sending (via a fake push service), scheduler, schedule.
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

/** Now in Zurich: date and time (HH:MM) – as the scheduler computes it (TZ=Europe/Zurich). */
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

/** Writes a custom reminder directly into the schedule (without the „already sent today“ marker). */
function writeCustom(reminder: Record<string, unknown>) {
	const d = db();
	const cfg = JSON.parse((d.prepare(`SELECT value FROM meta WHERE key = 'reminders'`).get() as { value: string }).value);
	cfg.custom = [{ id: 'r1', title: 'Wasser trinken', body: 'Ein Glas', enabled: true, repeat: 'daily', date: '', weekdays: [], day: 1, createdAt: '', ...reminder }];
	d.prepare(`UPDATE meta SET value = ? WHERE key = 'reminders'`).run(JSON.stringify(cfg));
	d.prepare(`DELETE FROM meta WHERE key = 'reminder_sent_custom'`).run();
	d.close();
}

/** Restarts the server (same data): the scheduler checks 5 seconds after the start. */
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

describe('Devices', () => {
	test('register; invalid addresses and requests without signing in rejected', async () => {
		const dev = push.device('/push/phone');
		assert.equal((await c.api('/api/push', { subscription: dev.subscription, label: 'iPhone' })).status, 200);
		assert.equal(deviceCount(), 1);
		assert.match(await server.waitForOutput(/push device registered service=127\.0\.0\.1/), /push device registered service=127\.0\.0\.1/);
		const bad = { ...dev.subscription, endpoint: 'http://127.0.0.1/x' };
		assert.equal((await c.api('/api/push', { subscription: bad })).status, 400);
		assert.equal((await c.api('/api/push', { subscription: { endpoint: 'https://x' } })).status, 400);
		assert.equal((await new Client(server.url).api('/api/push', { subscription: dev.subscription })).status, 401);
		assert.equal(deviceCount(), 1);
		// the same address again: no second device
		await c.api('/api/push', { subscription: dev.subscription, label: 'iPhone' });
		assert.equal(deviceCount(), 1);
	});

	test('test notification: encrypted, urgent, without journal content', async () => {
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

	test('an expired device is removed, errors of the service are only logged', async () => {
		const gone = push.device('/push/gone');
		const broken = push.device('/push/broken');
		push.status.set('/push/gone', 410);
		push.status.set('/push/broken', 500);
		await c.api('/api/push', { subscription: gone.subscription });
		await c.api('/api/push', { subscription: broken.subscription });
		assert.equal(deviceCount(), 3);
		const r = await c.api('/api/push/test', {});
		assert.equal(r.json.sent, 1);
		assert.equal(deviceCount(), 2, 'expired one removed, failing one stays');
		assert.match(await server.waitForOutput(/push device expired and removed/), /push device expired and removed/);
		assert.match(await server.waitForOutput(/push failed status=500/), /push failed status=500/);
		await c.api('/api/push', { endpoint: broken.subscription.endpoint }, 'DELETE');
		assert.equal(deviceCount(), 1);
	});
});

describe('Scheduler', () => {
	test('a custom reminder is sent exactly once at the set time', async () => {
		const { date, time } = zurichNow();
		writeCustom({ time });
		push.messages.length = 0;
		await restart();
		const [m] = await push.waitFor(1);
		assert.ok(m, 'reminder sent');
		assert.deepEqual(m.payload, { title: 'Wasser trinken', body: 'Ein Glas', url: '/reminders', tag: 'custom-r1' });
		assert.equal(JSON.parse(readMeta('reminder_sent_custom')!).r1, date);
		// the log line only comes after the response of the push service
		assert.match(await server.waitForOutput(/push sent tag=custom devices=1 of=1/), /push sent tag=custom devices=1 of=1/);
		// restart on the same day: not again
		push.messages.length = 0;
		await restart();
		assert.equal((await push.waitFor(1, 8_000)).length, 0);
	});

	test('switching on after the time does not send right away', async () => {
		writeCustom({ time: '00:00', enabled: false });
		({ client: c } = await login());
		const r = await c.action('/reminders?/toggle', { id: 'r1', enabled: 'true' });
		assert.equal(r.type, 'success');
		push.messages.length = 0;
		await restart();
		assert.equal((await push.waitFor(1, 8_000)).length, 0, 'erst wieder morgen');
	});

	test('a new reminder with a past time does not send right away', async () => {
		({ client: c } = await login());
		const r = await c.action('/reminders?/save', { title: 'Neu', body: '', repeat: 'daily', time: '00:00' });
		assert.equal(r.type, 'success');
		push.messages.length = 0;
		await restart();
		assert.equal((await push.waitFor(1, 8_000)).length, 0);
	});

	test('without devices nothing is sent', async () => {
		({ client: c } = await login());
		await c.api('/api/push', { all: true }, 'DELETE');
		assert.equal(deviceCount(), 0);
		const { time } = zurichNow();
		writeCustom({ time });
		await restart();
		await new Promise((r) => setTimeout(r, 7_000));
		assert.doesNotMatch(server.output(), /push sent/);
		assert.equal(readMeta('reminder_sent_custom'), null, 'stays open until there is a device');
	});
});

describe('Schedule of the reviews', () => {
	test('save, invalid values to default, a review for today after its time counts as sent', async () => {
		({ client: c } = await login());
		const weekday = new Date(zurichNow().date + 'T00:00:00Z').getUTCDay();
		const r = await c.action('/reminders?/reviews', {
			feelingsEnabled: 'on',
			feelingsWeekday: String(weekday),
			feelingsTime: '00:00',
			growthEnabled: 'on',
			growthDay: '99',
			growthTime: '25:00'
		});
		assert.equal(r.type, 'success');
		const cfg = JSON.parse(readMeta('reminders')!);
		assert.deepEqual(cfg.feelings, { enabled: true, weekday, time: '00:00' });
		assert.deepEqual(cfg.growth, { enabled: true, day: 'last', time: '19:00' });
		assert.equal(readMeta('reminder_sent_feelings'), zurichNow().date);
	});

	test('the page shows the reminders', async () => {
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
