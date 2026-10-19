import Database from 'better-sqlite3';

import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 006 runs on the owner's phone over real lists (0.7.x, schema 5). These start from a
 * version-5 database with trip and reusable lists, packing and shopping, items for someone and for
 * no one, and check that every existing row comes through untouched and every one-person "For"
 * becomes exactly one recipient.
 */

const v6 = MIGRATIONS.find((migration) => migration.version === 6)!;
const now = '2026-10-19T09:00:00.000Z';

function versionFiveDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS.filter((m) => m.version <= 5)) {
    db.exec(migrationBatch(migration));
  }
  return db;
}

const upgrade = (db: Database.Database) => db.transaction(() => db.exec(migrationBatch(v6)))();

function fillLikeAPhone(db: Database.Database) {
  db.prepare(
    `INSERT INTO trips (id, name, destination, start_date, end_date, default_tz, created_at,
                        updated_at)
     VALUES ('t1', 'Лапландия', 'Finland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
  ).run(now, now);
  const traveller = db.prepare(
    `INSERT INTO travellers (id, name, sort_order, created_at, updated_at, classification)
     VALUES (?, ?, 0, ?, ?, ?)`,
  );
  traveller.run('p1', 'Evelina', now, now, 'adult');
  traveller.run('p2', 'Mia', now, now, 'child');
  traveller.run('p3', 'Misho', now, now, 'unspecified');
  db.prepare(
    `INSERT INTO trip_travellers (trip_id, traveller_id, sort_order, classification)
     VALUES ('t1', 'p1', 0, 'adult'), ('t1', 'p2', 1, 'child')`,
  ).run();
  const list = db.prepare(
    `INSERT INTO lists (id, trip_id, kind, name, source_list_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  list.run('l-shop', 't1', 'shopping', 'Shopping', null, now, now);
  list.run('l-pack', 't1', 'packing', 'Packing', 'l-master', now, now);
  list.run('l-master', null, 'packing', 'Winter layers', null, now, now);
  const item = db.prepare(
    `INSERT INTO list_items (id, list_id, label, quantity, unit, category, note, traveller_id,
                             done_at, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  item.run('a', 'l-shop', 'Merino base layer', 2, 'pcs', 'Clothing', 'Size S', 'p1', null, 0, now, now);
  item.run('b', 'l-shop', 'Hand warmers', 10, null, null, null, null, now, 1, now, now);
  item.run('c', 'l-pack', 'Snow boots', null, null, null, null, 'p2', null, 0, now, now);
  // On a reusable list: a profile who is on no trip at all.
  item.run('d', 'l-master', 'Wool socks', 3, 'pairs', null, null, 'p3', null, 0, now, now);
}

const OLD_TABLES = [
  'trips',
  'travellers',
  'trip_travellers',
  'lists',
  'list_items',
  'trip_items',
  'expenses',
  'resources',
  'settings',
];

function snapshot(db: Database.Database) {
  return Object.fromEntries(
    OLD_TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
  );
}

const recipients = (db: Database.Database) =>
  db
    .prepare(`SELECT list_item_id, traveller_id FROM list_item_recipients ORDER BY list_item_id`)
    .all();

describe('migration 006 — list item recipients', () => {
  it('leaves every existing row exactly as it was', () => {
    const db = versionFiveDb();
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgrade(db);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(6);
  });

  it('turns each one-person "For" into exactly one recipient, trip and reusable lists alike', () => {
    const db = versionFiveDb();
    fillLikeAPhone(db);
    upgrade(db);
    expect(recipients(db)).toEqual([
      { list_item_id: 'a', traveller_id: 'p1' },
      { list_item_id: 'c', traveller_id: 'p2' },
      { list_item_id: 'd', traveller_id: 'p3' },
    ]);
  });

  it('upgrades an empty database', () => {
    const db = versionFiveDb();
    upgrade(db);
    expect(recipients(db)).toEqual([]);
  });

  it('copies nothing twice if its insert runs again', () => {
    const db = versionFiveDb();
    fillLikeAPhone(db);
    upgrade(db);
    const insert = v6.sql.slice(v6.sql.indexOf('INSERT OR IGNORE'));
    db.exec(insert);
    expect(recipients(db)).toHaveLength(3);
  });

  it('leaves nothing behind when the batch fails part-way', () => {
    const db = versionFiveDb();
    fillLikeAPhone(db);
    const before = snapshot(db);
    db.exec('CREATE TABLE list_item_recipients (x TEXT)'); // forces the batch to fail
    expect(() => upgrade(db)).toThrow();
    db.exec('DROP TABLE list_item_recipients');
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = versionFiveDb();
      fillLikeAPhone(db);
      upgrade(db);
    });
    const add = (item: string, person: string) =>
      db
        .prepare(`INSERT INTO list_item_recipients (list_item_id, traveller_id) VALUES (?, ?)`)
        .run(item, person);

    it('holds several people per item, each once', () => {
      add('a', 'p2');
      add('a', 'p3');
      expect(() => add('a', 'p1')).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(recipients(db).filter((row: any) => row.list_item_id === 'a')).toHaveLength(3);
    });

    it('refuses a recipient who is not a profile, or an item that does not exist', () => {
      expect(() => add('a', 'nobody')).toThrow(/FOREIGN KEY/);
      expect(() => add('nothing', 'p1')).toThrow(/FOREIGN KEY/);
    });

    it('drops an item’s recipients with the item, and nobody else’s', () => {
      add('b', 'p1');
      db.prepare(`DELETE FROM list_items WHERE id = 'a'`).run();
      expect(recipients(db)).toEqual([
        { list_item_id: 'b', traveller_id: 'p1' },
        { list_item_id: 'c', traveller_id: 'p2' },
        { list_item_id: 'd', traveller_id: 'p3' },
      ]);
    });

    it('drops a deleted profile from lists, as the old column cleared itself', () => {
      db.prepare(`DELETE FROM travellers WHERE id = 'p3'`).run();
      expect(recipients(db).some((row: any) => row.traveller_id === 'p3')).toBe(false);
    });
  });
});
