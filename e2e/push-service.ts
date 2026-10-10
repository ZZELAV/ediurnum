/**
 * Schein-Push-Dienst für Ende-zu-Ende-Tests: ein lokaler HTTPS-Server (selbstsigniertes Zertifikat per
 * openssl) nimmt Web-Push-Nachrichten an und entschlüsselt sie wie ein Browser (RFC 8291, aes128gcm).
 * Der ediurnum-Server muss dafür mit NODE_TLS_REJECT_UNAUTHORIZED=0 laufen.
 */
import { execFileSync } from 'node:child_process';
import { createDecipheriv, createECDH, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PushMessage {
	path: string;
	headers: Record<string, string | string[] | undefined>;
	payload: { title: string; body: string; url: string; tag: string };
}

/** Ein „Gerät“: Schlüssel wie im Browser, Adresse beim Schein-Dienst. */
export interface FakeDevice {
	subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
	decrypt(body: Buffer): string;
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

function device(endpoint: string): FakeDevice {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	const auth = randomBytes(16);
	const uaPublic = ecdh.getPublicKey();
	return {
		subscription: { endpoint, keys: { p256dh: uaPublic.toString('base64url'), auth: auth.toString('base64url') } },
		decrypt(body) {
			const salt = body.subarray(0, 16);
			const idlen = body[20];
			const asPublic = body.subarray(21, 21 + idlen);
			const data = body.subarray(21 + idlen);
			const secret = ecdh.computeSecret(asPublic);
			const prkKey = hmac(auth, secret);
			const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
			const prk = hmac(salt, ikm);
			const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
			const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
			const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
			decipher.setAuthTag(data.subarray(data.length - 16));
			const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
			// letzter Datensatz: Inhalt, dann Trennzeichen 0x02 und Füllnullen
			let end = plain.length;
			while (end > 0 && plain[end - 1] === 0) end--;
			return plain.subarray(0, end - 1).toString('utf8');
		}
	};
}

export interface FakePushService {
	url: string;
	messages: PushMessage[];
	/** Antwortstatus pro Pfad (Standard 201) */
	status: Map<string, number>;
	device(path: string): FakeDevice;
	/** Wartet, bis mindestens `count` Nachrichten da sind (oder die Zeit abläuft). */
	waitFor(count: number, ms?: number): Promise<PushMessage[]>;
	close(): Promise<void>;
}

export async function startPushService(): Promise<FakePushService> {
	const dir = mkdtempSync(join(tmpdir(), 'ediurnum-push-'));
	const key = join(dir, 'key.pem');
	const cert = join(dir, 'cert.pem');
	execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
	const devices = new Map<string, FakeDevice>();
	const messages: PushMessage[] = [];
	const status = new Map<string, number>();
	const server: Server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			const path = req.url ?? '';
			const dev = devices.get(path);
			if (dev) messages.push({ path, headers: req.headers, payload: JSON.parse(dev.decrypt(Buffer.concat(chunks))) });
			res.writeHead(status.get(path) ?? 201).end();
		});
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const url = `https://127.0.0.1:${(server.address() as { port: number }).port}`;
	return {
		url,
		messages,
		status,
		device(path) {
			const d = device(url + path);
			devices.set(path, d);
			return d;
		},
		async waitFor(count, ms = 15_000) {
			const until = Date.now() + ms;
			while (messages.length < count && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
			return messages;
		},
		async close() {
			await new Promise((r) => server.close(r));
			rmSync(dir, { recursive: true, force: true });
		}
	};
}
