import { sql as m001 } from './001-initial';
import { sql as m002 } from './002-expenses';
import { sql as m003 } from './003-fieldbook';
import { sql as m004 } from './004-traveller-classification';
import { sql as m005 } from './005-converted-travellers';
import { sql as m006 } from './006-list-item-recipients';
import { sql as m007 } from './007-booking-payments';
import { sql as m008 } from './008-cost-shares';
import { sql as m009 } from './009-settlements';
import { sql as m010 } from './010-unsplit-confirmations';
import { sql as m011 } from './011-settlement-reviews';
import { sql as m012 } from './012-currency-conversion';
import { sql as m013 } from './013-exchange-rate-pairs';
import { sql as m014 } from './014-undated-trips';

export type Migration = {
  version: number;
  sql: string;
  /**
   * Drops and recreates a table other tables reference, so it must run with foreign keys OFF —
   * or the drop would cascade-delete their rows. The runner checks them before it commits.
   */
  rebuildsTables?: true;
};

/** Append-only. Never edit a shipped migration — add a new one. */
export const MIGRATIONS: Migration[] = [
  { version: 1, sql: m001 },
  { version: 2, sql: m002 },
  { version: 3, sql: m003 },
  { version: 4, sql: m004 },
  { version: 5, sql: m005 },
  { version: 6, sql: m006 },
  { version: 7, sql: m007 },
  { version: 8, sql: m008 },
  { version: 9, sql: m009 },
  { version: 10, sql: m010 },
  { version: 11, sql: m011 },
  { version: 12, sql: m012 },
  { version: 13, sql: m013 },
  { version: 14, sql: m014, rebuildsTables: true },
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
