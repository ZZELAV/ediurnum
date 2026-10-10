/**
 * Sitzung: Lebenszeichen, Verlassen der App, Einstellung „Sperren nach Verlassen der App“.
 * Das eigentliche Sperren nach Ablauf (mindestens 1 Minute) ist im Browser geprüft; hier nur, was schnell geht.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, setupJournal, startServer, type TestServer } from './helpers.ts';

let server: TestServer;
let c: Client;

before(async () => {
	server = await startServer();
	({ client: c } = await setupJournal(server));
});
after(() => server.stop());

const general = (leaveMinutes: string) =>
	c.action('/settings?/general', { name: 'Testperson', language: 'de', theme: 'system', sessionMinutes: '30', welcome: 'on', leaveMinutes });

const leaveSetting = async () => {
	const html = await (await c.get('/settings')).text();
	return html.match(/<select id="leave"[^>]*>[\s\S]*?<option value="(\d+)" selected/)?.[1];
};

describe('Verlassen der App', () => {
	test('Standard: nach 1 Minute sperren', async () => {
		assert.equal(await leaveSetting(), '1');
	});

	test('Kurz verlassen und zurück: Sitzung bleibt offen', async () => {
		assert.equal((await c.api('/api/session', {}, 'POST')).status, 200);
		assert.equal((await c.api('/api/session')).status, 200);
		assert.equal((await c.get('/archive')).status, 200);
	});

	test('Einstellung speichern, ungültige Werte ignorieren', async () => {
		assert.equal((await general('15')).type, 'success');
		assert.equal(await leaveSetting(), '15');
		await general('7');
		assert.equal(await leaveSetting(), '15', 'nur 1, 5, 15 oder 0');
		await general('0');
		assert.equal(await leaveSetting(), '0');
	});

	test('Ohne Anmeldung: 401', async () => {
		const other = new Client(server.url);
		assert.equal((await other.api('/api/session', {}, 'POST')).status, 401);
		assert.equal((await other.api('/api/session')).status, 401);
	});
});
