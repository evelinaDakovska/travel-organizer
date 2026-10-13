import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrate } from './client';
import { LATEST_VERSION } from './migrations';
import { asyncDatabase } from './testing/asyncDatabase';

describe('migrate', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
    file = join(dir, 'test.db');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A connection that records every statement it executes. */
  const recording = () => {
    const db = new Database(file);
    const executed: string[] = [];
    const exec = db.exec.bind(db);
    db.exec = ((sql: string) => {
      executed.push(sql);
      return exec(sql);
    }) as typeof db.exec;
    const open = () => new Database(file);
    return { db, executed, async: asyncDatabase(db, { openConnection: open }) };
  };

  it('brings a new database up to date, in WAL, with the per-connection settings', async () => {
    const { db, async } = recording();
    await migrate(async);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.close();
  });

  it('does not set the journal mode again on a database already in WAL', async () => {
    const first = recording();
    await migrate(first.async);
    first.db.close();

    const second = recording();
    await migrate(second.async);
    expect(second.executed.some((sql) => /journal_mode\s*=/.test(sql))).toBe(false);
    expect(second.db.pragma('foreign_keys', { simple: true })).toBe(1);
    second.db.close();
  });
});
