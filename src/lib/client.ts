/** Kleine Hilfe für JSON-Aufrufe der eigenen API. */
export async function api<T = unknown>(
	url: string,
	method: 'GET' | 'POST' | 'DELETE' = 'POST',
	body?: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; data: Record<string, unknown> }> {
	try {
		const res = await fetch(url, {
			method,
			headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
			body: body !== undefined ? JSON.stringify(body) : undefined
		});
		const data = await res.json().catch(() => ({}));
		if (res.status === 401) {
			location.href = '/login';
		}
		if (!res.ok) return { ok: false, error: data.error ?? data.message ?? 'common.error', status: res.status, data };
		return { ok: true, data: data as T };
	} catch {
		return { ok: false, error: 'common.error', status: 0, data: {} };
	}
}
