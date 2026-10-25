import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrate } from '../client';
import { asyncDatabase } from '../testing/asyncDatabase';
import { fillEveryTable, fillLikeAPhone } from '../testing/phoneShaped';
import { LATEST_VERSION, migrationBatch, MIGRATIONS } from './index';

/**
 * The owner's Stable 0.7.2 holds schema 5; its upgrade runs 006–014 in one start-up. Here a file
 * database at 5 (and at 6) with a row in every table goes through the app's own `migrate()` — the
 * runner, its second connection and 014's rebuild with foreign keys off — not the SQL alone
 * (release audit F-01).
 */

type Row = Record<string, unknown>;

/** A file database at `version`, filled like a phone. */
function seedAt(file: string, version: 5 | 6) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS.filter((m) => m.version <= version)) {
    db.transaction(() => db.exec(migrationBatch(migration)))();
  }
  fillLikeAPhone(db);
  fillEveryTable(db, version);
  return db;
}

function tables(db: Database.Database): Record<string, Row[]> {
  const names = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as { name: string }[];
  return Object.fromEntries(
    names.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all() as Row[]]),
  );
}

/** Every table, index and trigger, as SQLite stores it. */
function schemaOf(db: Database.Database) {
  return db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all();
}

describe('upgrading a phone-shaped database through migrate() (F-01)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'upgrade-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function runApp(file: string) {
    const db = new Database(file);
    await migrate(asyncDatabase(db, { openConnection: () => new Database(file) }));
    return db;
  }

  async function newInstallSchema() {
    const fresh = await runApp(join(dir, 'fresh.db'));
    const schema = schemaOf(fresh);
    fresh.close();
    return schema;
  }

  it.each([5, 6] as const)('%i → latest keeps every row, is consistent, and matches a new install', async (version) => {
    const file = join(dir, `phone-${version}.db`);
    const seed = seedAt(file, version);
    expect(seed.pragma('user_version', { simple: true })).toBe(version);
    const before = tables(seed);
    // A row in every table, or the test proves less than it says.
    for (const [name, rows] of Object.entries(before)) {
      if (name === 'list_item_recipients' && version === 5) continue;
      expect([name, rows.length > 0]).toEqual([name, true]);
    }
    seed.close();

    const db = await runApp(file);
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);

    const after = tables(db);
    for (const [name, rows] of Object.entries(before)) {
      if (name === 'list_item_recipients') continue;
      // The same rows in the same order; later migrations only add columns to them.
      expect([name, after[name]!.length]).toEqual([name, rows.length]);
      rows.forEach((row) => expect(after[name]).toContainEqual(expect.objectContaining(row)));
    }
    // 006 turns each one-person list item into a recipient; at 6 they are already there.
    const recipients = after.list_item_recipients!.map((r) => `${r.list_item_id}:${r.traveller_id}`).sort();
    expect(recipients).toEqual(version === 5 ? ['li1:mia', 'li3:ev'] : ['li1:ana', 'li1:mia', 'li3:ev']);

    expect(schemaOf(db)).toEqual(await newInstallSchema());
    db.close();
  });

  it('a second start changes nothing', async () => {
    const file = join(dir, 'twice.db');
    seedAt(file, 5).close();
    const first = await runApp(file);
    const once = { rows: tables(first), schema: schemaOf(first) };
    first.close();
    const second = await runApp(file);
    expect({ rows: tables(second), schema: schemaOf(second) }).toEqual(once);
    second.close();
  });
});
