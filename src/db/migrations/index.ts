import { sql as m001 } from './001-initial';

export type Migration = { version: number; sql: string };

/** Append-only. Never edit a shipped migration — add a new one. */
export const MIGRATIONS: Migration[] = [{ version: 1, sql: m001 }];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
