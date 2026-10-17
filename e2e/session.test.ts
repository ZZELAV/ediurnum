/**
 * Session: sign of life, leaving the app, setting „lock after leaving the app“.
 * The actual locking after the time runs out (at least 1 minute) was checked in the browser; here only what is quick.
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

describe('Leaving the app', () => {
	test('default: lock after 1 minute', async () => {
		assert.equal(await leaveSetting(), '1');
	});

	test('leaving briefly and coming back: the session stays open', async () => {
		assert.equal((await c.api('/api/session', {}, 'POST')).status, 200);
		assert.equal((await c.api('/api/session')).status, 200);
		assert.equal((await c.get('/archive')).status, 200);
	});

	test('save the setting, ignore invalid values', async () => {
		assert.equal((await general('15')).type, 'success');
		assert.equal(await leaveSetting(), '15');
		await general('7');
		assert.equal(await leaveSetting(), '15', 'only 1, 5, 15 or 0');
		await general('0');
		assert.equal(await leaveSetting(), '0');
	});

	test('without signing in: 401', async () => {
		const other = new Client(server.url);
		assert.equal((await other.api('/api/session', {}, 'POST')).status, 401);
		assert.equal((await other.api('/api/session')).status, 401);
	});
});
