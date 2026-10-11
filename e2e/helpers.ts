/**
 * Hilfen für Ende-zu-Ende-Tests: startet den gebauten Server (`node server.js`) mit einem leeren
 * Datenordner und spricht ihn über HTTP an – wie ein Browser, inklusive Cookies und Herkunft.
 * Voraussetzung: `npm run build`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'devalue';

const ROOT = new URL('..', import.meta.url);

export const PASSWORD = 'e2e-Passwort-lang-genug';
export const PIN = '482913';

/** Heutiges Datum (plus `offset` Tage) in der Zeitzone des Testservers (TZ=Europe/Zurich). */
export function zurichToday(offset = 0) {
	const d = new Date(new Date().toLocaleString('sv', { timeZone: 'Europe/Zurich' }).slice(0, 10) + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + offset);
	return d.toISOString().slice(0, 10);
}

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address() as { port: number };
			srv.close(() => resolve(port));
		});
		srv.on('error', reject);
	});
}

export interface TestServer {
	url: string;
	dataDir: string;
	/** Bisherige Ausgabe des Servers (für Prüfungen am Log) */
	output(): string;
	/**
	 * Wartet, bis das Log die Zeile enthält (höchstens `ms`), und gibt das Log zurück. Nötig, weil die Ausgabe
	 * des Servers über eine Pipe kommt und eine HTTP-Antwort sie überholen kann.
	 */
	waitForOutput(re: RegExp, ms?: number): Promise<string>;
	/** Beendet den Server; der Datenordner wird gelöscht, ausser mit keepData. */
	stop(opts?: { keepData?: boolean }): Promise<void>;
}

/**
 * Startet eine eigene Instanz – mit leerem Datenordner oder einem bestehenden (`dataDir`).
 * `env` ergänzt oder überschreibt Variablen.
 */
export async function startServer(env: Record<string, string | undefined> = {}, opts: { dataDir?: string } = {}): Promise<TestServer> {
	if (!existsSync(new URL('build/index.js', ROOT))) throw new Error('Zuerst bauen: npm run build');
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'ediurnum-e2e-'));
	let out = '';
	const child: ChildProcess = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
		cwd: ROOT,
		env: {
			PATH: process.env.PATH,
			SystemRoot: process.env.SystemRoot,
			DATA_DIR: dataDir,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: url,
			TZ: 'Europe/Zurich',
			LOG_LEVEL: 'info',
			BODY_SIZE_LIMIT: '50M',
			...env
		}
	});
	child.stdout!.on('data', (d) => (out += d));
	child.stderr!.on('data', (d) => (out += d));
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Server startet nicht:\n' + out)), 15000);
		const check = () => {
			if (out.includes('Listening on')) {
				clearTimeout(timer);
				resolve();
			}
		};
		child.stdout!.on('data', check);
		child.on('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`Server beendet (${code}):\n${out}`));
		});
	});
	return {
		url,
		dataDir,
		output: () => out,
		waitForOutput: async (re, ms = 5_000) => {
			const until = Date.now() + ms;
			while (!re.test(out) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
			return out;
		},
		stop: async ({ keepData = false } = {}) => {
			if (child.exitCode === null) {
				const exited = new Promise((r) => child.once('exit', r));
				child.kill();
				await exited;
			}
			if (!keepData) rmSync(dataDir, { recursive: true, force: true });
		}
	};
}

export interface ActionResult {
	status: number;
	type: 'success' | 'failure' | 'redirect' | 'error';
	data: Record<string, unknown> | undefined;
	location?: string;
}

/** Ein „Browser“ mit eigenen Cookies. */
export class Client {
	cookies = new Map<string, string>();
	/** Rohe Set-Cookie-Kopfzeilen der letzten Antwort */
	lastSetCookie: string[] = [];

	base: string;
	origin: string;

	constructor(base: string, origin = base) {
		this.base = base;
		this.origin = origin;
	}

	private store(res: Response) {
		this.lastSetCookie = res.headers.getSetCookie();
		for (const c of this.lastSetCookie) {
			const [pair, ...attrs] = c.split(';');
			const i = pair.indexOf('=');
			const name = pair.slice(0, i).trim();
			const value = pair.slice(i + 1).trim();
			const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim()) || /expires=thu, 01 jan 1970/i.test(a.trim()));
			if (expired || value === '') this.cookies.delete(name);
			else this.cookies.set(name, value);
		}
	}

	private cookieHeader() {
		return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
	}

	async request(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		if (this.cookies.size) headers.set('cookie', this.cookieHeader());
		if (init.method && init.method !== 'GET' && !headers.has('origin')) headers.set('origin', this.origin);
		const res = await fetch(this.base + path, { ...init, headers, redirect: 'manual' });
		this.store(res);
		return res;
	}

	get(path: string, headers: Record<string, string> = {}) {
		return this.request(path, { headers });
	}

	/** Formular-Aktion wie mit use:enhance (Antwort als JSON). Dateien als Blob übergeben. */
	async action(path: string, fields: Record<string, string | Blob>, headers: Record<string, string> = {}): Promise<ActionResult> {
		const hasFile = Object.values(fields).some((v) => typeof v !== 'string');
		let body: BodyInit;
		const h: Record<string, string> = { 'x-sveltekit-action': 'true', accept: 'application/json', ...headers };
		if (hasFile) {
			const fd = new FormData();
			for (const [k, v] of Object.entries(fields)) fd.append(k, v);
			body = fd;
		} else {
			body = new URLSearchParams(fields as Record<string, string>).toString();
			h['content-type'] = 'application/x-www-form-urlencoded';
		}
		const res = await this.request(path, { method: 'POST', headers: h, body });
		const text = await res.text();
		let json: { type: ActionResult['type']; status?: number; data?: string; location?: string };
		try {
			json = JSON.parse(text);
		} catch {
			return { status: res.status, type: 'error', data: { text } };
		}
		return {
			status: res.status,
			type: json.type,
			data: json.data ? (parse(json.data) as Record<string, unknown>) : undefined,
			location: json.location
		};
	}

	/** JSON-API */
	async api(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
		const res = await this.request(path, {
			method,
			headers: body === undefined ? {} : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const text = await res.text();
		let json: unknown = null;
		try {
			json = JSON.parse(text);
		} catch {
			json = text;
		}
		return { status: res.status, json: json as Record<string, unknown> };
	}
}

/** Richtet ein neues Tagebuch ein und gibt den angemeldeten Client samt Wiederherstellungsschlüssel zurück. */
export async function setupJournal(server: TestServer, name = 'Testperson') {
	const client = new Client(server.url);
	const r = await client.action('/setup?/create', { name, password: PASSWORD, confirm: PASSWORD });
	if (r.type !== 'success') throw new Error('Einrichtung fehlgeschlagen: ' + JSON.stringify(r));
	return { client, recoveryKey: String(r.data!.recoveryKey) };
}
