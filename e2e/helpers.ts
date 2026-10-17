/**
 * Helpers for end-to-end tests: starts the built server (`node server.js`) with an empty
 * data folder and talks to it over HTTP – like a browser, including cookies and origin.
 * Requires `npm run build`.
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

/** Today's date (plus `offset` days) in the time zone of the test server (TZ=Europe/Zurich). */
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
	/** Output of the server so far (for checks on the log) */
	output(): string;
	/**
	 * Waits until the log contains the line (at most `ms`) and returns the log. Needed because the output
	 * of the server arrives through a pipe and an HTTP response can overtake it.
	 */
	waitForOutput(re: RegExp, ms?: number): Promise<string>;
	/** Stops the server; the data folder is deleted unless keepData is set. */
	stop(opts?: { keepData?: boolean }): Promise<void>;
}

/**
 * Starts an instance of its own – with an empty data folder or an existing one (`dataDir`).
 * `env` adds or overrides variables.
 */
export async function startServer(env: Record<string, string | undefined> = {}, opts: { dataDir?: string } = {}): Promise<TestServer> {
	if (!existsSync(new URL('build/index.js', ROOT))) throw new Error('Build first: npm run build');
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
		const timer = setTimeout(() => reject(new Error('Server does not start:\n' + out)), 15000);
		const check = () => {
			if (out.includes('Listening on')) {
				clearTimeout(timer);
				resolve();
			}
		};
		child.stdout!.on('data', check);
		child.on('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`Server exited (${code}):\n${out}`));
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

/** A "browser" with its own cookies. */
export class Client {
	cookies = new Map<string, string>();
	/** Raw Set-Cookie headers of the last response */
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
		// like a browser in Swiss German – the tests expect the German texts
		if (!headers.has('accept-language')) headers.set('accept-language', 'de-CH,de;q=0.9');
		if (init.method && init.method !== 'GET' && !headers.has('origin')) headers.set('origin', this.origin);
		const res = await fetch(this.base + path, { ...init, headers, redirect: 'manual' });
		this.store(res);
		return res;
	}

	get(path: string, headers: Record<string, string> = {}) {
		return this.request(path, { headers });
	}

	/** Form action like with use:enhance (response as JSON). Pass files as a Blob. */
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

	/** JSON API */
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

/** Sets up a new journal and returns the signed-in client together with the recovery key. */
export async function setupJournal(server: TestServer, name = 'Testperson') {
	const client = new Client(server.url);
	const r = await client.action('/setup?/create', { name, password: PASSWORD, confirm: PASSWORD });
	if (r.type !== 'success') throw new Error('setup failed: ' + JSON.stringify(r));
	return { client, recoveryKey: String(r.data!.recoveryKey) };
}
