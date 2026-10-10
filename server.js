// Startskript für den Produktivbetrieb (Docker: `node server.js`).
//
// Seit adapter-node 6 gibt es die Variable ORIGIN nicht mehr: Die Adresse wird aus den Anfrage-Headern
// abgeleitet, und ohne PROTOCOL_HEADER nimmt SvelteKit „https“ an. Ein direkter Aufruf über
// http://… würde dann jedes Formular als fremd ablehnen (403). Ist ORIGIN gesetzt, übernimmt dieses
// Skript Protokoll und Host daraus – wie adapter-node bis Version 5. Ohne ORIGIN gilt das Verhalten
// von adapter-node (Host-Header, PROTOCOL_HEADER/HOST_HEADER hinter einem Proxy).
//
// Alles andere (PORT, HOST, SOCKET_PATH, SHUTDOWN_TIMEOUT, BODY_SIZE_LIMIT …) bleibt beim Server
// von adapter-node, der hier nur geladen wird.

const PROTO_HEADER = 'x-ediurnum-origin-proto';
const HOST_HEADER = 'x-ediurnum-origin-host';

const raw = process.env.ORIGIN?.trim();
/** @type {{ proto: string, host: string } | null} */
let origin = null;
if (raw) {
	let url;
	try {
		url = new URL(raw);
	} catch {
		console.error(`ORIGIN is not a valid address: ${raw}`);
		process.exit(1);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		console.error(`ORIGIN must start with http:// or https://, got: ${raw}`);
		process.exit(1);
	}
	origin = { proto: url.protocol.slice(0, -1), host: url.host };
	// Muss vor dem Laden des Servers gesetzt sein: adapter-node liest die Variablen beim Start
	process.env.PROTOCOL_HEADER = PROTO_HEADER;
	process.env.HOST_HEADER = HOST_HEADER;
	delete process.env.PORT_HEADER;
}

// Pfad als Variable, damit die Typprüfung den (erst beim Build erzeugten) Ordner nicht auflösen will
const entry = new URL('./build/index.js', import.meta.url).href;
/** @type {{ server: import('node:http').Server }} */
const { server } = await import(entry);

if (origin) {
	const fixed = origin;
	// Läuft vor dem Handler von adapter-node; überschreibt auch Werte, die ein Client selbst mitschickt
	server.prependListener('request', (req) => {
		req.headers[PROTO_HEADER] = fixed.proto;
		req.headers[HOST_HEADER] = fixed.host;
	});
}
