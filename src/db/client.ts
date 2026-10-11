import type { SQLiteDatabase } from 'expo-sqlite';

import { LATEST_VERSION, migrationBatch, MIGRATIONS } from './migrations';

export const DATABASE_NAME = 'travel-organizer.db';

/**
 * Runs on every connection. `foreign_keys` is per-connection and not persisted;
 * `journal_mode` is persisted but setting it again is harmless.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
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
