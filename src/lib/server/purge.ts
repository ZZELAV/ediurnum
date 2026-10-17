import { getDb, setMeta, transaction } from './db.ts';
import { destroyAllSessions } from './vault.ts';

/**
 * Endgültiges Löschen („Purge“). SQLite läuft mit secure_delete, gelöschte Inhalte werden
 * überschrieben; danach wird die Datei verdichtet, damit keine alten Seiten übrig bleiben.
 */

/** Löscht alle Einträge, Versionen und KI-Auswertungen. Konto, Einstellungen und Erinnerungen bleiben. */
export function purgeContent() {
	transaction(() => {
		getDb().exec('DELETE FROM entry_revisions; DELETE FROM entries; DELETE FROM analyses;');
		setMeta('reminder_sent_feelings', null);
		setMeta('reminder_sent_growth', null);
	});
	compact();
}

/** Setzt ediurnum vollständig zurück: alle Daten inkl. Passwort und Geräte. Danach folgt die Einrichtung. */
export function resetAll() {
	transaction(() => {
		getDb().exec(`
			DELETE FROM entry_revisions;
			DELETE FROM entries;
			DELETE FROM analyses;
			DELETE FROM push_subscriptions;
			DELETE FROM meta WHERE key <> 'schema';
		`);
	});
	compact();
	destroyAllSessions();
}

function compact() {
	getDb().exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
}
