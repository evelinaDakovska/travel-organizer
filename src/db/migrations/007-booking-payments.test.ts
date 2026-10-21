import Database from 'better-sqlite3';

import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 007 will run on the owner's phone over a real trip (0.13.0, schema 6). These start
 * from a version-6 database shaped like it — paid and unpaid bookings, a journey, a non-refundable
 * cancellation, expenses with a receipt, a child, Me — and with values the app has never written
 * in the unused legacy fields (`expenses.paid_by`, `split`, the name-based `payments`), because
 * real data is never assumed to be empty (`phase3-plan.md` §15 *11*).
 */

const v7 = MIGRATIONS.find((migration) => migration.version === 7)!;
const now = '2026-10-21T09:00:00.000Z';

function versionSixDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS.filter((m) => m.version <= 6)) {
    db.exec(migrationBatch(migration));
  }
  return db;
}

const upgrade = (db: Database.Database) => db.transaction(() => db.exec(migrationBatch(v7)))();

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
  db.prepare(
    `INSERT INTO trip_travellers (trip_id, traveller_id, sort_order, classification)
     VALUES ('t1', 'p1', 0, 'adult'), ('t1', 'p2', 1, 'child')`,
  ).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('me_traveller_id', 'p1')`).run();

  const item = db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, subkind, status, title, details, price_amount,
                             price_currency, is_paid, created_at, updated_at)
     VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  item.run('hotel', 'stay', 'hotel', 'confirmed', 'Hotel Aurora', null, 25000, 'EUR', 1, now, now);
  item.run(
    'husky',
    'activity',
    null,
    'confirmed',
    'Husky safari',
    '{"pricing":{"mode":"perPerson","lines":[{"quantity":2,"unitAmount":9000,"for":"adult"}]}}',
    18000,
    'EUR',
    0,
    now,
    now,
  );
  item.run('leg1', 'transport', 'flight', 'confirmed', 'SOF → HEL', '{"journeyId":"j1"}', 40000, 'BGN', 0, now, now);
  item.run('leg2', 'transport', 'flight', 'confirmed', 'HEL → RVN', '{"journeyId":"j1"}', null, null, 0, now, now);
  item.run('sauna', 'activity', null, 'cancelled', 'Sauna', '{"refundable":false}', 3000, 'EUR', 1, now, now);
  db.prepare(`INSERT INTO item_participants (item_id, traveller_id) VALUES ('husky', 'p1'), ('husky', 'p2')`).run();

  const expense = db.prepare(
    `INSERT INTO expenses (id, trip_id, category, label, amount, currency, spent_on, notes,
                           paid_by, split, created_at, updated_at)
     VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  expense.run('e1', 'food', 'Reindeer soup', 2400, 'EUR', '2026-11-21', null, null, null, now, now);
  // Never written by the app, but possible in a file someone edited or a future build: kept as is.
  expense.run('e2', 'transport', 'Taxi', 3500, 'EUR', '2026-11-20', 'Airport', 'Ana', '{"mode":"equal"}', now, now);
  db.prepare(
    `INSERT INTO payments (id, trip_id, from_name, to_name, amount, currency, created_at)
     VALUES ('legacy-pay', 't1', 'Ana', 'Evelina', 1750, 'EUR', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO resources (id, trip_id, trip_item_id, kind, subtype, label, stored_path,
                            file_name, mime_type, size_bytes, sort_order, created_at, expense_id)
     VALUES ('r1', 't1', NULL, 'file', 'generic', 'Receipt', 'media/r.pdf', 'r.pdf',
             'application/pdf', 99, 0, ?, 'e1')`,
  ).run(now);
}

/** Every table that existed at version 6, with the columns it had then. */
const OLD_TABLES: Record<string, string> = {
  trips: '*',
  travellers: '*',
  trip_travellers: '*',
  trip_items: '*',
  item_participants: '*',
  lists: '*',
  list_items: '*',
  list_item_recipients: '*',
  templates: '*',
  template_uses: '*',
  trip_notes: '*',
  resources: '*',
  settings: '*',
  payments: '*',
  expenses:
    'id, trip_id, category, label, amount, currency, spent_on, notes, paid_by, split, created_at, updated_at',
};

function snapshot(db: Database.Database) {
  return Object.fromEntries(
    Object.entries(OLD_TABLES).map(([table, columns]) => [
      table,
      db.prepare(`SELECT ${columns} FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 007 — booking payments', () => {
  it('leaves every existing row exactly as it was, legacy money fields included', () => {
    const db = versionSixDb();
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgrade(db);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(7);
  });

  it('writes no money record: every expense stays standalone with no payer', () => {
    const db = versionSixDb();
    fillLikeAPhone(db);
    upgrade(db);
    expect(count(db, `SELECT COUNT(*) AS n FROM booking_payments`)).toBe(0);
    expect(db.prepare(`SELECT id, trip_item_id, payer_id FROM expenses ORDER BY id`).all()).toEqual([
      { id: 'e1', trip_item_id: null, payer_id: null },
      { id: 'e2', trip_item_id: null, payer_id: null },
    ]);
  });

  it('upgrades an empty database', () => {
    const db = versionSixDb();
    upgrade(db);
    expect(count(db, `SELECT COUNT(*) AS n FROM booking_payments`)).toBe(0);
  });

  it('leaves nothing behind when the batch fails part-way', () => {
    const db = versionSixDb();
    fillLikeAPhone(db);
    const before = snapshot(db);
    db.exec('CREATE INDEX idx_expenses_payer ON expenses(paid_by)'); // forces the batch to fail
    expect(() => upgrade(db)).toThrow();
    db.exec('DROP INDEX idx_expenses_payer');
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(6);
    expect(
      count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'booking_payments'`),
    ).toBe(0);
    expect(
      db.prepare(`SELECT name FROM pragma_table_info('expenses') WHERE name IN ('trip_item_id', 'payer_id')`).all(),
    ).toEqual([]);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = versionSixDb();
      fillLikeAPhone(db);
      upgrade(db);
    });
    const pay = (id: string, item: string, payer: string | null = 'p1', amount = 10000) =>
      db
        .prepare(
          `INSERT INTO booking_payments (id, trip_id, trip_item_id, payer_id, amount, currency,
                                         paid_on, note, created_at, updated_at)
           VALUES (?, 't1', ?, ?, ?, 'EUR', '2026-10-01', NULL, ?, ?)`,
        )
        .run(id, item, payer, amount, now, now);

    it('refuses a payment of nothing, for no booking, or by someone who is not a profile', () => {
      expect(() => pay('x', 'hotel', 'p1', 0)).toThrow(/CHECK/);
      expect(() => pay('x', 'nothing')).toThrow(/FOREIGN KEY/);
      expect(() => pay('x', 'hotel', 'nobody')).toThrow(/FOREIGN KEY/);
      pay('ok', 'hotel', null); // payer not recorded
    });

    it('refuses to delete a booking that has a payment, keeping both', () => {
      pay('pay1', 'hotel');
      expect(() => db.prepare(`DELETE FROM trip_items WHERE id = 'hotel'`).run()).toThrow(/FOREIGN KEY/);
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_items WHERE id = 'hotel'`)).toBe(1);
      expect(count(db, `SELECT COUNT(*) AS n FROM booking_payments`)).toBe(1);
    });

    it('refuses to delete a booking that has a linked expense, keeping both', () => {
      db.prepare(`UPDATE expenses SET trip_item_id = 'husky' WHERE id = 'e2'`).run();
      expect(() => db.prepare(`DELETE FROM trip_items WHERE id = 'husky'`).run()).toThrow(/FOREIGN KEY/);
      expect(count(db, `SELECT COUNT(*) AS n FROM expenses WHERE trip_item_id = 'husky'`)).toBe(1);
    });

    it('still deletes a booking with no money records', () => {
      pay('pay1', 'hotel');
      db.prepare(`DELETE FROM trip_items WHERE id = 'husky'`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_items WHERE id = 'husky'`)).toBe(0);
    });

    it('deletes a whole trip with its bookings, payments and expenses in one statement', () => {
      pay('pay1', 'hotel');
      pay('pay2', 'hotel', null, 5000);
      db.prepare(`UPDATE expenses SET trip_item_id = 'husky', payer_id = 'p1' WHERE id = 'e2'`).run();
      db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
      for (const table of ['trip_items', 'booking_payments', 'expenses', 'resources', 'payments']) {
        expect(count(db, `SELECT COUNT(*) AS n FROM ${table}`)).toBe(0);
      }
    });

    it('refuses to delete a profile who paid something', () => {
      db.prepare(`DELETE FROM trip_travellers WHERE traveller_id = 'p1'`).run();
      db.prepare(`DELETE FROM item_participants WHERE traveller_id = 'p1'`).run();
      db.prepare(`DELETE FROM settings`).run();
      pay('pay1', 'hotel');
      expect(() => db.prepare(`DELETE FROM travellers WHERE id = 'p1'`).run()).toThrow(/FOREIGN KEY/);
      db.prepare(`DELETE FROM booking_payments`).run();
      db.prepare(`UPDATE expenses SET payer_id = 'p1' WHERE id = 'e1'`).run();
      expect(() => db.prepare(`DELETE FROM travellers WHERE id = 'p1'`).run()).toThrow(/FOREIGN KEY/);
    });

    it('refuses an expense linked to a booking that does not exist', () => {
      expect(() =>
        db.prepare(`UPDATE expenses SET trip_item_id = 'nothing' WHERE id = 'e1'`).run(),
      ).toThrow(/FOREIGN KEY/);
    });
  });
});
