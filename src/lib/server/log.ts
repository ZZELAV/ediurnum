import { LOG_LEVEL } from '$app/env/private';

/**
 * Protokoll für die Konsole (Docker-Log). Enthält nie Tagebuchinhalte, Passwörter oder Schlüssel –
 * nur Ereignisse, technische Angaben und Fehler.
 *
 * LOG_LEVEL: "error", "warn", "info" (Standard) oder "debug" (zusätzlich jede Anfrage).
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

function threshold(): number {
	const l = (LOG_LEVEL ?? '').toLowerCase();
	return l in LEVELS ? LEVELS[l as Level] : LEVELS.info;
}

function write(level: Level, message: string, details?: Record<string, unknown>) {
	if (LEVELS[level] > threshold()) return;
	const extra = details
		? ' ' +
			Object.entries(details)
				.filter(([, v]) => v !== undefined && v !== '')
				.map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : String(v)}`)
				.join(' ')
		: '';
	const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${extra}`;
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

export const log = {
	error: (message: string, details?: Record<string, unknown>) => write('error', message, details),
	warn: (message: string, details?: Record<string, unknown>) => write('warn', message, details),
	info: (message: string, details?: Record<string, unknown>) => write('info', message, details),
	debug: (message: string, details?: Record<string, unknown>) => write('debug', message, details),
	isDebug: () => threshold() >= LEVELS.debug
};
