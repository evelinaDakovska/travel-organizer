import Database from 'better-sqlite3';

import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 003 runs on the owner's phone over real data (0.5.1, schema 2). These tests start from
 * a version-2 database holding one of everything, with the awkward values, and check that it comes
 * through untouched — then that the new tables enforce what the design says.
 */

const [v1, v2, v3] = MIGRATIONS;
const now = '2026-10-13T09:00:00.000Z';

function versionTwoDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(migrationBatch(v1));
  db.exec(migrationBatch(v2));
  return db;
}

const upgrade = (db: Database.Database) => db.transaction(() => db.exec(migrationBatch(v3)))();

function fillLikeAPhone(db: Database.Database) {
  db.prepare(
    `INSERT INTO trips (id, name, destination, start_date, end_date, default_tz, notes,
                        traveller_count, travellers, created_at, updated_at)
     VALUES ('t1', 'Лапландия', 'Finland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', 'Ünïcode',
             3, '["Evelina","Ana","Mia"]', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, subkind, status, title, start_local, start_tz,
                             start_precision, start_utc, details, price_amount, price_currency,
                             is_paid, confirmation_code, created_at, updated_at)
     VALUES ('i1', 't1', 'transport', 'flight', 'confirmed', 'Flight to Munich',
             '2026-11-20T06:00', 'Europe/Sofia', 'time', '2026-11-20T04:00:00.000Z',
             '{"from":"Sofia","to":"Munich","journeyId":"j1","reminder":"3h"}', 99326, 'EUR', 1,
             'ABC123', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, title, completed_at, created_at, updated_at)
     VALUES ('i2', 't1', 'task', 'confirmed', 'Pack', ?, ?, ?)`,
  ).run(now, now, now);
  db.prepare(
    `INSERT INTO trip_notes (id, trip_id, title, body, pinned, sort_order, created_at, updated_at)
     VALUES ('n1', 't1', 'Packing', '- [ ] Adapter', 1, 0, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO expenses (id, trip_id, category, label, amount, currency, spent_on, created_at,
                           updated_at)
     VALUES ('e1', 't1', 'groceries', 'K-Market', 1250, 'EUR', '2026-11-21', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO resources (id, trip_id, trip_item_id, kind, subtype, label, stored_path,
                            file_name, mime_type, size_bytes, sort_order, created_at, expense_id)
     VALUES ('r1', 't1', NULL, 'file', 'generic', 'Receipt', 'media/b.pdf', 'r.pdf',
             'application/pdf', 99, 0, ?, 'e1')`,
  ).run(now);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('currency', 'EUR')`).run();
}

const OLD_TABLES = [
  'trips',
  'trip_items',
  'trip_notes',
  'resources',
  'settings',
  'expenses',
  'payments',
] as const;

const snapshot = (db: Database.Database) =>
  Object.fromEntries(
    OLD_TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
  );

const insert = (db: Database.Database, sql: string, ...params: unknown[]) =>
  db.prepare(sql).run(...params);

describe('migration 003 on a phone that already has data', () => {
  it('keeps every existing row and column exactly as it was', () => {
    const db = versionTwoDb();
    fillLikeAPhone(db);
    const before = snapshot(db);
    const columnsBefore = OLD_TABLES.map((table) => db.pragma(`table_info(${table})`));

    upgrade(db);

    expect(snapshot(db)).toEqual(before);
    expect(OLD_TABLES.map((table) => db.pragma(`table_info(${table})`))).toEqual(columnsBefore);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });

  it('adds the seven new tables, empty', () => {
    const db = versionTwoDb();
    fillLikeAPhone(db);
    upgrade(db);
    for (const table of [
      'travellers',
      'trip_travellers',
      'item_participants',
      'lists',
      'list_items',
      'templates',
      'template_uses',
    ]) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });
});

describe('migration 003 constraints', () => {
  function ready() {
    const db = versionTwoDb();
    fillLikeAPhone(db);
    upgrade(db);
    insert(
      db,
      `INSERT INTO travellers (id, name, created_at, updated_at) VALUES ('p1', 'Evelina', ?, ?)`,
      now,
      now,
    );
    return db;
  }

  it('refuses to delete a traveller a trip or an item still uses', () => {
    const db = ready();
    insert(db, `INSERT INTO trip_travellers (trip_id, traveller_id) VALUES ('t1', 'p1')`);
    expect(() => db.prepare(`DELETE FROM travellers WHERE id = 'p1'`).run()).toThrow(/FOREIGN KEY/);

    db.prepare(`DELETE FROM trip_travellers`).run();
    insert(db, `INSERT INTO item_participants (item_id, traveller_id) VALUES ('i1', 'p1')`);
    expect(() => db.prepare(`DELETE FROM travellers WHERE id = 'p1'`).run()).toThrow(/FOREIGN KEY/);
  });

  it('removes membership, participants, lists and their items with the trip, never the profile', () => {
    const db = ready();
    insert(db, `INSERT INTO trip_travellers (trip_id, traveller_id) VALUES ('t1', 'p1')`);
    insert(db, `INSERT INTO item_participants (item_id, traveller_id) VALUES ('i1', 'p1')`);
    insert(
      db,
      `INSERT INTO lists (id, trip_id, kind, name, created_at, updated_at)
       VALUES ('l1', 't1', 'packing', 'Winter', ?, ?)`,
      now,
      now,
    );
    insert(
      db,
      `INSERT INTO list_items (id, list_id, label, traveller_id, created_at, updated_at)
       VALUES ('li1', 'l1', 'Wool socks', 'p1', ?, ?)`,
      now,
      now,
    );
    insert(db, `INSERT INTO template_uses (trip_id, template_id, applied_at) VALUES ('t1', 'x', ?)`, now);

    db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();

    for (const table of ['trip_travellers', 'item_participants', 'lists', 'list_items', 'template_uses']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(db.prepare(`SELECT name FROM travellers`).all()).toEqual([{ name: 'Evelina' }]);
  });

  it('keeps a reusable list, with no trip, and its items', () => {
    const db = ready();
    insert(
      db,
      `INSERT INTO lists (id, trip_id, kind, name, created_at, updated_at)
       VALUES ('master', NULL, 'packing', 'Winter layers', ?, ?)`,
      now,
      now,
    );
    insert(
      db,
      `INSERT INTO lists (id, trip_id, kind, name, source_list_id, created_at, updated_at)
       VALUES ('copy', 't1', 'packing', 'Winter layers', 'master', ?, ?)`,
      now,
      now,
    );
    db.prepare(`DELETE FROM lists WHERE id = 'master'`).run();
    // The copy stays, still saying where it came from: provenance, not a foreign key.
    expect(db.prepare(`SELECT source_list_id FROM lists WHERE id = 'copy'`).get()).toEqual({
      source_list_id: 'master',
    });
  });

  it('clears an item’s person when that profile goes, keeping the item', () => {
    const db = ready();
    insert(
      db,
      `INSERT INTO lists (id, trip_id, kind, name, created_at, updated_at)
       VALUES ('l1', NULL, 'packing', 'Kids', ?, ?)`,
      now,
      now,
    );
    insert(
      db,
      `INSERT INTO list_items (id, list_id, label, traveller_id, created_at, updated_at)
       VALUES ('li1', 'l1', 'Mittens', 'p1', ?, ?)`,
      now,
      now,
    );
    db.prepare(`DELETE FROM travellers WHERE id = 'p1'`).run();
    expect(db.prepare(`SELECT label, traveller_id FROM list_items`).all()).toEqual([
      { label: 'Mittens', traveller_id: null },
    ]);
  });

  it('refuses a list of an unknown kind and a quantity below one', () => {
    const db = ready();
    expect(() =>
      insert(
        db,
        `INSERT INTO lists (id, kind, name, created_at, updated_at) VALUES ('x', 'gifts', 'X', ?, ?)`,
        now,
        now,
      ),
    ).toThrow(/CHECK/);
    insert(
      db,
      `INSERT INTO lists (id, kind, name, created_at, updated_at) VALUES ('l', 'shopping', 'S', ?, ?)`,
      now,
      now,
    );
    expect(() =>
      insert(
        db,
        `INSERT INTO list_items (id, list_id, label, quantity, created_at, updated_at)
         VALUES ('q', 'l', 'Batteries', 0, ?, ?)`,
        now,
        now,
      ),
    ).toThrow(/CHECK/);
  });
});
