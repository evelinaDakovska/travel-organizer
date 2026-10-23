import type { SQLiteDatabase } from 'expo-sqlite';

import { LATEST_VERSION, migrationBatch, MIGRATIONS, type Migration } from './migrations';

export const DATABASE_NAME = 'travel-organizer.db';

/** How long a statement waits for another connection's lock before giving up. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * Runs on every connection. `foreign_keys` and `busy_timeout` are per-connection and not
 * persisted. `journal_mode` is persisted, so it is set only when it is not WAL already: setting
 * it takes a lock, and while a connection from before (an activity Android recreated, a dev
 * reload) still holds one, that failed the whole launch with "database is locked". The busy
 * timeout makes any such overlap wait instead of fail.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  const mode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
  if (mode?.journal_mode.toLowerCase() !== 'wal') {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= LATEST_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    if (migration.rebuildsTables) {
      await rebuildTables(db, migration);
      continue;
    }
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(migrationBatch(migration));
    });
  }
}

/**
 * A migration that drops and recreates a referenced table (014), the way SQLite documents it:
 * foreign keys OFF outside the transaction (the pragma is ignored inside one), the rebuild and the
 * version in one transaction on this same connection, `foreign_key_check` unchanged before it commits,
 * and foreign keys back ON whatever happened. It refuses to run if they did not turn off: a drop
 * with them on would cascade-delete every child row.
 */
async function rebuildTables(db: SQLiteDatabase, migration: Migration): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    const keys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    if (keys?.foreign_keys !== 0) {
      throw new Error(`Migration ${migration.version} needs foreign keys off, and they are on`);
    }
    // Only references the rebuild breaks stop it. One already broken in the file (never written by
    // the app, which keeps foreign keys on) is carried over as it is, not a reason never to start.
    const brokenBefore = JSON.stringify(await db.getAllAsync('PRAGMA foreign_key_check'));
    await db.withTransactionAsync(async () => {
      await db.execAsync(migrationBatch(migration));
      const brokenAfter = JSON.stringify(await db.getAllAsync('PRAGMA foreign_key_check'));
      if (brokenAfter !== brokenBefore) {
        throw new Error(`Migration ${migration.version} broke references; nothing was changed`);
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
