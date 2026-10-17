// Start script for production (Docker: `node server.js`).
//
// Since adapter-node 6 there is no ORIGIN variable any more: the address is derived from the request headers,
// and without PROTOCOL_HEADER SvelteKit assumes „https“. A direct request via
// http://… would then reject every form as foreign (403). If ORIGIN is set, this
// script takes protocol and host from it – like adapter-node up to version 5. Without ORIGIN the behaviour
// of adapter-node applies (Host header, PROTOCOL_HEADER/HOST_HEADER behind a proxy).
//
// Everything else (PORT, HOST, SOCKET_PATH, SHUTDOWN_TIMEOUT, BODY_SIZE_LIMIT …) stays with the server
// of adapter-node, which is only loaded here.

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
	// must be set before the server is loaded: adapter-node reads the variables on start
	process.env.PROTOCOL_HEADER = PROTO_HEADER;
	process.env.HOST_HEADER = HOST_HEADER;
	delete process.env.PORT_HEADER;
}

// path as a variable, so the type check doesn't try to resolve the folder (only created by the build)
const entry = new URL('./build/index.js', import.meta.url).href;
/** @type {{ server: import('node:http').Server }} */
const { server } = await import(entry);

if (origin) {
	const fixed = origin;
	// runs before the handler of adapter-node; also overrides values a client sends itself
	server.prependListener('request', (req) => {
		req.headers[PROTO_HEADER] = fixed.proto;
		req.headers[HOST_HEADER] = fixed.host;
	});
}
