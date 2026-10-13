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

type Options = {
  /**
   * Opens another connection to the same database file, for `withExclusiveTransactionAsync` —
   * which in expo-sqlite runs on a connection of its own. Needs a file database, not ':memory:'.
   */
  openConnection?: () => Database.Database;
};

/**
 * Just enough of expo-sqlite's async API over better-sqlite3 for repository functions to run in
 * node tests — so a repository's transaction can be tested, not only its SQL. Test-only.
 */
export function asyncDatabase(db: Database.Database, options: Options = {}): SQLiteDatabase {
  const fake = {
    async execAsync(sql: string) {
      db.exec(sql);
    },
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
    async withExclusiveTransactionAsync(task: (txn: SQLiteDatabase) => Promise<void>) {
      if (!options.openConnection) throw new Error('asyncDatabase: pass openConnection');
      const connection = options.openConnection();
      connection.exec('BEGIN');
      try {
        await task(asyncDatabase(connection));
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      } finally {
        connection.close();
      }
    },
  };
  return fake as unknown as SQLiteDatabase;
}
