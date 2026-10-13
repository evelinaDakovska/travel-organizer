import { sql as m001 } from './001-initial';
import { sql as m002 } from './002-expenses';
import { sql as m003 } from './003-fieldbook';

export type Migration = { version: number; sql: string };

/** Append-only. Never edit a shipped migration — add a new one. */
export const MIGRATIONS: Migration[] = [
  { version: 1, sql: m001 },
  { version: 2, sql: m002 },
  { version: 3, sql: m003 },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * A migration and the version it brings the database to, run as one batch inside one transaction
 * so they commit together. An app killed mid-upgrade is left before the migration or after it —
 * never with the tables made but the version unrecorded, which would re-run the migration on the
 * next start and fail on `CREATE TABLE`.
 */
export function migrationBatch(migration: Migration): string {
  // Not parameterisable; the value is ours, never user input.
  return `${migration.sql}\nPRAGMA user_version = ${migration.version};`;
}
