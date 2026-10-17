import { getDb, setMeta, transaction } from './db.ts';
import { destroyAllSessions } from './vault.ts';

/**
 * Final deletion („purge“). SQLite runs with secure_delete, deleted content is
 * overwritten; afterwards the file is compacted so that no old pages remain.
 */

/** Deletes all entries, versions and AI analyses. Account, settings and reminders stay. */
export function purgeContent() {
	transaction(() => {
		getDb().exec('DELETE FROM entry_revisions; DELETE FROM entries; DELETE FROM analyses;');
		setMeta('reminder_sent_feelings', null);
		setMeta('reminder_sent_growth', null);
	});
	compact();
}

/** Resets ediurnum completely: all data including password and devices. Setup follows afterwards. */
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
