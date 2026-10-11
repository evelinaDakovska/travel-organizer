import Database from 'better-sqlite3';

import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 002 is the first to run on a phone with real data, so these tests start from a
 * version-1 database holding one of everything and check that it comes through untouched.
 */

const [v1, v2] = MIGRATIONS;
const now = '2026-10-11T09:00:00.000Z';

function versionOneDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(migrationBatch(v1));
  return db;
}

function upgrade(db: Database.Database) {
  db.transaction(() => db.exec(migrationBatch(v2)))();
}

/** One of everything a phone holds, with the awkward values: nulls, JSON, cents, unicode. */
function fillLikeAPhone(db: Database.Database) {
  db.prepare(
    `INSERT INTO trips (id, name, destination, start_date, end_date, default_tz, notes,
                        traveller_count, travellers, created_at, updated_at)
     VALUES ('t1', 'München', 'Germany', '2026-11-01', '2026-11-05', 'Europe/Berlin', 'Ünïcode',
             2, '["Evelina","Ana"]', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, subkind, status, title, start_local, start_tz,
                             start_precision, start_utc, details, price_amount, price_currency,
                             is_paid, confirmation_code, created_at, updated_at)
     VALUES ('i1', 't1', 'transport', 'flight', 'confirmed', 'Flight to Munich',
             '2026-11-01T06:10', 'Europe/Sofia', 'time', '2026-11-01T04:10:00.000Z',
             '{"from":"SOF","to":"MUC","reminder":"3h","refundable":false}', 99326, 'EUR', 1,
             'ABC123', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
     VALUES ('i2', 't1', 'food', 'idea', 'Viktualienmarkt', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO trip_notes (id, trip_id, title, body, pinned, sort_order, created_at, updated_at)
     VALUES ('n1', 't1', 'Packing', '- [ ] Adapter', 1, 0, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO resources (id, trip_id, trip_item_id, kind, subtype, label, stored_path,
                            file_name, mime_type, size_bytes, sort_order, created_at)
     VALUES ('r1', NULL, 'i1', 'file', 'ticket', 'Boarding pass', 'media/a.pdf', 'bp.pdf',
             'application/pdf', 1234, 0, ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO resources (id, trip_id, trip_item_id, kind, subtype, label, url, sort_order,
                            created_at)
     VALUES ('r2', 't1', NULL, 'link', 'website', 'Insurance', 'https://example.com', 0, ?)`,
  ).run(now);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('defaultTravellers', '["Evelina"]')`).run();
}

const TABLES = ['trips', 'trip_items', 'trip_notes', 'resources', 'settings'] as const;

function snapshot(db: Database.Database) {
  return Object.fromEntries(
    TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
  );
}

describe('migration 002 on a phone that already has data', () => {
  it('keeps every existing row exactly as it was', () => {
    const db = versionOneDb();
    fillLikeAPhone(db);
    const before = snapshot(db);

    upgrade(db);

    const after = snapshot(db);
    const resourcesWithoutNewColumn = (after.resources as Record<string, unknown>[]).map(
      ({ expense_id: _expenseId, ...rest }) => rest,
    );
    expect({ ...after, resources: resourcesWithoutNewColumn }).toEqual(before);
    expect((after.resources as { expense_id: unknown }[]).map((r) => r.expense_id)).toEqual([
      null,
      null,
    ]);
  });

  it('records version 2 and leaves a sound database', () => {
    const db = versionOneDb();
    fillLikeAPhone(db);
    upgrade(db);

    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('changes nothing at all when it fails part-way', () => {
    const db = versionOneDb();
    fillLikeAPhone(db);
    const before = snapshot(db);
    const broken = { version: 2, sql: `${v2.sql}\nTHIS IS NOT SQL;` };

    expect(() => db.transaction(() => db.exec(migrationBatch(broken)))()).toThrow();

    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(snapshot(db)).toEqual(before);
    const expenses = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'expenses'`)
      .all();
    expect(expenses).toEqual([]);
  });
});

describe('the expense tables', () => {
  function upgraded() {
    const db = versionOneDb();
    fillLikeAPhone(db);
    upgrade(db);
    return db;
  }

  function insertExpense(db: Database.Database, values: Partial<Record<string, unknown>> = {}) {
    const row = {
      id: 'e1',
      trip_id: 't1',
      category: 'food',
      amount: 1250,
      currency: 'EUR',
      spent_on: '2026-11-02',
      ...values,
    };
    db.prepare(
      `INSERT INTO expenses (id, trip_id, category, amount, currency, spent_on, created_at,
                             updated_at)
       VALUES ($id, $trip_id, $category, $amount, $currency, $spent_on, '${now}', '${now}')`,
    ).run(row);
  }

  function insertReceipt(db: Database.Database) {
    db.prepare(
      `INSERT INTO resources (id, trip_id, expense_id, kind, subtype, label, stored_path,
                              sort_order, created_at)
       VALUES ('rc', 't1', 'e1', 'file', 'generic', 'Receipt', 'media/r.jpg', 0, ?)`,
    ).run(now);
  }

  const count = (db: Database.Database, sql: string) =>
    (db.prepare(sql).get() as { n: number }).n;

  it('rejects an unknown category and an amount that is not positive', () => {
    const db = upgraded();
    expect(() => insertExpense(db, { category: 'fun' })).toThrow(/CHECK/);
    expect(() => insertExpense(db, { amount: 0 })).toThrow(/CHECK/);
  });

  it('removes an expense and its receipt rows with the trip', () => {
    const db = upgraded();
    insertExpense(db);
    insertReceipt(db);

    db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();

    expect(count(db, `SELECT COUNT(*) AS n FROM expenses`)).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM resources WHERE expense_id IS NOT NULL`)).toBe(0);
  });

  it('removes a receipt row with its expense, and nothing else', () => {
    const db = upgraded();
    insertExpense(db);
    insertReceipt(db);

    db.prepare(`DELETE FROM expenses WHERE id = 'e1'`).run();

    expect(count(db, `SELECT COUNT(*) AS n FROM resources`)).toBe(2);
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_items`)).toBe(2);
  });
});
