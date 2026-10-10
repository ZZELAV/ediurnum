/**
 * Bereich 1: Einrichten, Anmelden, Abmelden, Passwort vergessen, Wiederherstellen aus Backup.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, setupJournal, startServer, type TestServer } from './helpers.ts';

const KEY_FORMAT = /^([A-Z2-9]{4}-){13}[A-Z2-9]{4}$/;

describe('Vor der Einrichtung', () => {
	let server: TestServer;
	before(async () => (server = await startServer()));
	after(() => server.stop());

	test('Alle Seiten führen zur Einrichtung, die API verweigert', async () => {
		const c = new Client(server.url);
		for (const path of ['/', '/login', '/settings', '/recover']) {
			const res = await c.get(path);
			assert.equal(res.status, 303, path);
			assert.equal(res.headers.get('location'), '/setup', path);
		}
		assert.equal((await c.api('/api/search', { query: 'x' })).status, 401);
		assert.equal((await c.get('/setup')).status, 200);
	});

	test('Eingaben werden geprüft', async () => {
		const c = new Client(server.url);
		const cases: [Record<string, string>, string][] = [
			[{ name: ' ', password: PASSWORD, confirm: PASSWORD }, 'error.nameMissing'],
			[{ name: 'A', password: 'kurz', confirm: 'kurz' }, 'error.passwordTooShort'],
			[{ name: 'A', password: PASSWORD, confirm: PASSWORD + 'x' }, 'error.passwordMismatch'],
			[{ name: 'A', password: 'x'.repeat(1025), confirm: 'x'.repeat(1025) }, 'error.passwordTooLong']
		];
		for (const [fields, error] of cases) {
			const r = await c.action('/setup?/create', fields);
			assert.equal(r.type, 'failure', error);
			assert.equal(r.status, 400, error);
			assert.equal(r.data?.error, error);
		}
	});
});

describe('Einrichten, Anmelden, Abmelden', () => {
	let server: TestServer;
	let recoveryKey: string;
	before(async () => {
		server = await startServer();
	});
	after(() => server.stop());

	test('Einrichtung liefert den Wiederherstellungsschlüssel und meldet an', async () => {
		const r = await setupJournal(server);
		recoveryKey = r.recoveryKey;
		assert.match(recoveryKey, KEY_FORMAT);
		const session = r.client.lastSetCookie.find((c) => c.startsWith('ediurnum_session='))!;
		assert.ok(session, 'Sitzungs-Cookie gesetzt');
		assert.match(session, /HttpOnly/i);
		assert.match(session, /SameSite=Strict/i);
		assert.doesNotMatch(session, /Secure/i, 'über http:// ohne Secure, sonst schickt der Browser es nicht');
		assert.match(session, /Path=\//);
		assert.equal((await r.client.get('/')).status, 200);
		assert.match(await server.waitForOutput(/journal created/), /journal created/);
	});

	test('Zweite Einrichtung ist nicht möglich', async () => {
		const c = new Client(server.url);
		const r = await c.action('/setup?/create', { name: 'B', password: PASSWORD, confirm: PASSWORD });
		assert.equal(r.data?.error, 'error.alreadyInitialized');
		const res = await c.get('/setup');
		assert.equal(res.status, 303);
		assert.equal(res.headers.get('location'), '/login');
	});

	test('Falsches Passwort wird abgelehnt, richtiges öffnet das Tagebuch', async () => {
		const c = new Client(server.url);
		let r = await c.action('/login', { password: 'falsches-passwort' });
		assert.equal(r.status, 400);
		assert.equal(r.data?.error, 'error.wrongPassword');
		r = await c.action('/login', { password: 'x'.repeat(5000) });
		assert.equal(r.data?.error, 'error.wrongPassword', 'zu langes Passwort wird gar nicht erst abgeleitet');
		r = await c.action('/login', { password: PASSWORD });
		assert.equal(r.type, 'redirect');
		assert.equal(r.location, '/');
		assert.equal((await c.get('/')).status, 200);
		// angemeldet zurück zur Anmeldeseite → Startseite
		const res = await c.get('/login');
		assert.equal(res.headers.get('location'), '/');
	});

	test('Abmelden beendet die Sitzung auf dem Server', async () => {
		const c = new Client(server.url);
		await c.action('/login', { password: PASSWORD });
		const token = c.cookies.get('ediurnum_session')!;
		const r = await c.action('/logout', {});
		assert.equal(r.location, '/login');
		assert.ok(!c.cookies.has('ediurnum_session'), 'Cookie gelöscht');
		// Auch wer das alte Cookie noch hat, kommt nicht mehr hinein
		const stale = new Client(server.url);
		stale.cookies.set('ediurnum_session', token);
		const res = await stale.get('/');
		assert.equal(res.headers.get('location'), '/login');
		assert.equal((await stale.api('/api/session', {})).status, 401);
	});

	test('GET /logout meldet nicht ab', async () => {
		const c = new Client(server.url);
		await c.action('/login', { password: PASSWORD });
		await c.get('/logout');
		assert.equal((await c.get('/')).status, 200);
	});

	test('Formulare von fremden Seiten werden abgelehnt (auch mit gefälschten Kopfzeilen)', async () => {
		const variants: Record<string, string>[] = [
			{ origin: 'https://evil.example' },
			{ origin: server.url.replace('http:', 'https:') },
			{ origin: 'http://evil.example', 'x-ediurnum-origin-host': 'evil.example', 'x-ediurnum-origin-proto': 'http' }
		];
		for (const headers of variants) {
			const c = new Client(server.url);
			const res = await c.request('/login', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
				body: new URLSearchParams({ password: PASSWORD }).toString()
			});
			assert.equal(res.status, 403, JSON.stringify(headers));
			assert.ok(!c.cookies.has('ediurnum_session'));
		}
	});

	test('Sicherheits-Kopfzeilen', async () => {
		const res = await new Client(server.url).get('/login');
		const csp = res.headers.get('content-security-policy') ?? '';
		assert.match(csp, /default-src 'self'/);
		assert.match(csp, /frame-ancestors 'none'/);
		assert.match(csp, /script-src 'self' 'nonce-/);
		assert.equal(res.headers.get('x-frame-options'), 'DENY');
		assert.equal(res.headers.get('referrer-policy'), 'same-origin');
		assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
		assert.equal(res.headers.get('cache-control'), 'no-store');
	});

	test('Passwort vergessen: Schlüssel wird geprüft', async () => {
		const c = new Client(server.url);
		const good = { password: 'neues-Passwort-123', confirm: 'neues-Passwort-123' };
		const cases: [string, string][] = [
			['ABCD-EFGH', 'recovery.invalidLength'],
			[recoveryKey.replace(/[A-Z]/, 'O'), 'recovery.invalidChars'],
			[recoveryKey.slice(0, -1) + (recoveryKey.endsWith('A') ? 'B' : 'A'), 'recovery.invalidChecksum']
		];
		for (const [key, error] of cases) {
			const r = await c.action('/recover', { ...good, recoveryKey: key });
			assert.equal(r.data?.error, error, key);
		}
		// gültiger Schlüssel, aber von einem anderen Tagebuch
		const other = await startServer();
		try {
			const { recoveryKey: foreign } = await setupJournal(other);
			const r = await c.action('/recover', { ...good, recoveryKey: foreign });
			assert.equal(r.data?.error, 'recovery.wrongKey');
		} finally {
			await other.stop();
		}
		const r = await c.action('/recover', { password: 'kurz', confirm: 'kurz', recoveryKey });
		assert.equal(r.data?.error, 'error.passwordTooShort');
	});

	test('Passwort vergessen: neues Passwort setzen beendet alle Sitzungen', async () => {
		const other = new Client(server.url);
		await other.action('/login', { password: PASSWORD });
		assert.equal((await other.get('/')).status, 200);

		const c = new Client(server.url);
		// Kleinschreibung und Leerzeichen statt Bindestrichen sind erlaubt
		const typed = recoveryKey.toLowerCase().replaceAll('-', ' ');
		const r = await c.action('/recover', { password: 'neues-Passwort-123', confirm: 'neues-Passwort-123', recoveryKey: typed });
		assert.equal(r.location, '/');
		assert.equal((await c.get('/')).status, 200, 'direkt angemeldet');
		assert.equal((await other.get('/')).headers.get('location'), '/login', 'andere Sitzung beendet');

		const login = new Client(server.url);
		assert.equal((await login.action('/login', { password: PASSWORD })).data?.error, 'error.wrongPassword');
		assert.equal((await login.action('/login', { password: 'neues-Passwort-123' })).location, '/');
	});
});

describe('Bremse gegen Durchprobieren', () => {
	let server: TestServer;
	before(async () => {
		server = await startServer();
		await setupJournal(server);
	});
	after(() => server.stop());

	test('Nach fünf Fehlversuchen ist die Anmeldung vorübergehend gesperrt – auch mit richtigem Passwort', async () => {
		const c = new Client(server.url);
		for (let i = 0; i < 5; i++) assert.equal((await c.action('/login', { password: 'falsch-' + i })).status, 400);
		const r = await c.action('/login', { password: PASSWORD });
		assert.equal(r.status, 429);
		assert.equal(r.data?.error, 'error.throttled');
		assert.ok(Number(r.data?.seconds) > 0 && Number(r.data?.seconds) <= 30);
		assert.match(await server.waitForOutput(/failed attempt/), /failed attempt/);
		assert.doesNotMatch(server.output(), /falsch-/, 'Passwörter erscheinen nie im Log');
	});
});

describe('Wiederherstellen aus einem Backup', () => {
	test('Backup einer Instanz lässt sich in einer neuen einspielen', async () => {
		const source = await startServer();
		const target = await startServer();
		try {
			const { client, recoveryKey } = await setupJournal(source);
			assert.equal((await client.api('/api/entry/2026-01-15', { content: { mood: 4, sections: {}, free: 'Backup-Test' } })).status, 200);
			const res = await client.get('/api/export/backup');
			assert.equal(res.status, 200);
			const backup = await res.text();
			assert.ok(!backup.includes('Backup-Test'), 'Backup ist verschlüsselt');

			const c = new Client(target.url);
			const file = new Blob([backup], { type: 'application/octet-stream' });
			const base = { password: 'anderes-Passwort-1', confirm: 'anderes-Passwort-1' };
			// falscher (aber gültiger) Schlüssel
			const other = await setupJournal(await startServerOnce(after));
			let r = await c.action('/setup?/restore', { ...base, backup: file, recoveryKey: other.recoveryKey });
			assert.equal(r.data?.error, 'backup.wrongKey');
			// keine Datei
			r = await c.action('/setup?/restore', { ...base, backup: new Blob([]), recoveryKey });
			assert.equal(r.data?.error, 'backup.missingFile');
			// keine Backup-Datei
			r = await c.action('/setup?/restore', { ...base, backup: new Blob(['hallo']), recoveryKey });
			assert.equal(r.data?.error, 'backup.invalidFile');

			r = await c.action('/setup?/restore', { ...base, backup: file, recoveryKey });
			assert.equal(r.location, '/');
			const exported = await c.api('/api/export/plain?format=json');
			assert.equal(exported.status, 200);
			const entries = exported.json.entries as { date: string; content: { free: string } }[];
			assert.deepEqual(entries.map((e) => [e.date, e.content.free]), [['2026-01-15', 'Backup-Test']]);
			// Anmelden mit dem neuen Passwort
			const login = new Client(target.url);
			assert.equal((await login.action('/login', { password: 'anderes-Passwort-1' })).location, '/');
		} finally {
			await source.stop();
			await target.stop();
		}
	});
});

describe('Gleichzeitige Einrichtung', () => {
	test('Nur eine von zwei gleichzeitigen Einrichtungen gewinnt, die andere erhält eine Meldung', async () => {
		const server = await startServer();
		try {
			const a = new Client(server.url);
			const b = new Client(server.url);
			const [ra, rb] = await Promise.all([
				a.action('/setup?/create', { name: 'A', password: 'passwort-von-A', confirm: 'passwort-von-A' }),
				b.action('/setup?/create', { name: 'B', password: 'passwort-von-B', confirm: 'passwort-von-B' })
			]);
			const results = [ra, rb];
			assert.equal(results.filter((r) => r.type === 'success').length, 1);
			assert.equal(results.filter((r) => r.data?.error === 'error.alreadyInitialized').length, 1);
			const winner = ra.type === 'success' ? 'passwort-von-A' : 'passwort-von-B';
			assert.equal((await new Client(server.url).action('/login', { password: winner })).location, '/');
		} finally {
			await server.stop();
		}
	});
});

/** Startet eine Instanz, die nach dem Test automatisch beendet wird. */
async function startServerOnce(afterHook: typeof after) {
	const s = await startServer();
	afterHook(() => s.stop());
	return s;
}
