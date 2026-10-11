import type Database from 'better-sqlite3';
import type { SQLiteDatabase } from 'expo-sqlite';

type Params = Record<string, unknown> | unknown[] | string | number | null;

/** expo-sqlite names bindings `$id`; better-sqlite3 wants the bare name. Positional pass through. */
function bindings(params: Params = {}): unknown[] {
  if (params === null || typeof params !== 'object') return [params];
  if (Array.isArray(params)) return params;
  return [
    Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key.replace(/^\$/, ''), value]),
    ),
  ];
}

/**
 * Just enough of expo-sqlite's async API over better-sqlite3 for repository functions to run in
 * node tests — so a repository's transaction can be tested, not only its SQL. Test-only.
 */
export function asyncDatabase(db: Database.Database): SQLiteDatabase {
  const fake = {
    async runAsync(sql: string, params?: Params) {
      const { changes, lastInsertRowid } = db.prepare(sql).run(...bindings(params));
      return { changes, lastInsertRowId: Number(lastInsertRowid) };
    },
    async getFirstAsync(sql: string, params?: Params) {
      return db.prepare(sql).get(...bindings(params)) ?? null;
    },
    async getAllAsync(sql: string, params?: Params) {
      return db.prepare(sql).all(...bindings(params));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return fake as unknown as SQLiteDatabase;
}
