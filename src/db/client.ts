import type { SQLiteDatabase } from 'expo-sqlite';

import { LATEST_VERSION, migrationBatch, MIGRATIONS } from './migrations';

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
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(migrationBatch(migration));
    });
  }
}
