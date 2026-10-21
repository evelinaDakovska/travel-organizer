import Database from 'better-sqlite3';

import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 008 will run on the owner's phone right after 007, in the same start-up: the phone is
 * on 0.13.0 (schema 6), and 0.14.0 never reached it. So these start from schema 6 shaped like it,
 * run 007 and 008 as the app does, and also from schema 7 carrying 3D-1 money records — with values
 * the app never writes in the unused legacy fields, because real data is never assumed to be empty.
 */

const now = '2026-10-21T09:00:00.000Z';

function databaseAt(version: number) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS.filter((m) => m.version <= version)) {
    db.exec(migrationBatch(migration));
  }
  return db;
}

/** As `client.ts` runs them: each pending migration in its own transaction, in order. */
function upgradeTo(db: Database.Database, version: number) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS.filter((m) => m.version > current && m.version <= version)) {
    db.transaction(() => db.exec(migrationBatch(migration)))();
  }
}

/** A trip like the owner's at schema 6: a family, paid and unpaid bookings, legacy money values. */
function fillLikeAPhone(db: Database.Database) {
  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t1', 'Лапландия', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
  ).run(now, now);
  const traveller = db.prepare(
    `INSERT INTO travellers (id, name, sort_order, created_at, updated_at, classification)
     VALUES (?, ?, 0, ?, ?, ?)`,
  );
  traveller.run('ev', 'Evelina', now, now, 'adult');
  traveller.run('ana', 'Ana', now, now, 'adult');
  traveller.run('mia', 'Mia', now, now, 'child');
  db.prepare(
    `INSERT INTO trip_travellers (trip_id, traveller_id, sort_order, classification)
     VALUES ('t1', 'ev', 0, 'adult'), ('t1', 'ana', 1, 'adult'), ('t1', 'mia', 2, 'child')`,
  ).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('me_traveller_id', 'ev')`).run();
  const item = db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, title, details, price_amount, price_currency,
                             is_paid, created_at, updated_at)
     VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  item.run('hotel', 'stay', 'confirmed', 'Hotel Aurora', null, 25000, 'EUR', 1, now, now);
  item.run(
    'husky',
    'activity',
    'confirmed',
    'Husky safari',
    '{"pricing":{"mode":"perPerson","lines":[{"quantity":2,"unitAmount":9000,"for":"adult"},{"quantity":1,"unitAmount":4500,"for":"child"}]}}',
    22500,
    'EUR',
    0,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO item_participants (item_id, traveller_id) VALUES ('husky', 'ev'), ('husky', 'mia')`,
  ).run();
  db.prepare(
    `INSERT INTO expenses (id, trip_id, category, label, amount, currency, spent_on, paid_by, split,
                           created_at, updated_at)
     VALUES ('e1', 't1', 'food', 'Soup', 2400, 'EUR', '2026-11-21', NULL, NULL, ?, ?),
            ('e2', 't1', 'transport', 'Taxi', 3500, 'EUR', '2026-11-20', 'Ana', '{"mode":"equal"}', ?, ?)`,
  ).run(now, now, now, now);
  db.prepare(
    `INSERT INTO payments (id, trip_id, from_name, to_name, amount, currency, created_at)
     VALUES ('legacy', 't1', 'Ana', 'Evelina', 1750, 'EUR', ?)`,
  ).run(now);
}

/** What 3D-1 adds on 0.14.0: a deposit, a linked expense, a payer. */
function addMoneyRecords(db: Database.Database) {
  db.prepare(
    `INSERT INTO booking_payments (id, trip_id, trip_item_id, payer_id, amount, currency, paid_on,
                                   note, created_at, updated_at)
     VALUES ('bp1', 't1', 'hotel', 'ev', 10000, 'EUR', '2026-10-01', 'Deposit', ?, ?)`,
  ).run(now, now);
  db.prepare(`UPDATE expenses SET trip_item_id = 'husky', payer_id = 'ana' WHERE id = 'e1'`).run();
}

/** Every table and column that existed at schema 7. */
function snapshot(db: Database.Database) {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('cost_shares', 'trip_cover')
        ORDER BY name`,
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 008 — cost shares and cover', () => {
  it('7 → 8 leaves every existing row exactly as it was, 3D-1 records and legacy fields included', () => {
    const db = databaseAt(7);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    const before = snapshot(db);
    upgradeTo(db, 8);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    expect(count(db, `SELECT COUNT(*) AS n FROM cost_shares`)).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_cover`)).toBe(0);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('6 → 8 in one start-up, as on the phone: every old row identical, nothing written', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgradeTo(db, 8);
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    const after = snapshot(db);
    expect(after.booking_payments).toEqual([]);
    // The expenses gained 007's two columns, both NULL; nothing else in any old table changed.
    expect(after.expenses).toEqual(
      (before.expenses as object[]).map((row) => ({ ...row, trip_item_id: null, payer_id: null })),
    );
    for (const table of Object.keys(before).filter((name) => name !== 'expenses')) {
      expect([table, after[table]]).toEqual([table, before[table]]);
    }
    expect(count(db, `SELECT COUNT(*) AS n FROM cost_shares`)).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_cover`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('leaves schema 7 untouched when the batch fails part-way', () => {
    const db = databaseAt(7);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    const before = snapshot(db);
    db.exec('CREATE INDEX idx_trip_cover_adult ON trips(name)'); // forces the batch to fail
    expect(() => upgradeTo(db, 8)).toThrow();
    db.exec('DROP INDEX idx_trip_cover_adult');
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(7);
    expect(
      count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('cost_shares', 'trip_cover')`),
    ).toBe(0);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = databaseAt(7);
      fillLikeAPhone(db);
      addMoneyRecords(db);
      upgradeTo(db, 8);
      db.prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES ('t2', 'Rome', '2026-12-01', '2026-12-03', 'Europe/Rome', ?, ?)`,
      ).run(now, now);
      db.prepare(
        `INSERT INTO travellers (id, name, sort_order, created_at, updated_at, classification)
         VALUES ('solo', 'Rome only', 0, ?, ?, 'adult')`,
      ).run(now, now);
      db.prepare(`INSERT INTO trip_travellers (trip_id, traveller_id) VALUES ('t2', 'solo')`).run();
    });
    const share = (
      id: string,
      who: string,
      owner: { item?: string; expense?: string },
      extra: { amount?: number | null; coveredBy?: string | null; trip?: string } = {},
    ) =>
      db
        .prepare(
          `INSERT INTO cost_shares (id, trip_id, trip_item_id, expense_id, traveller_id, amount,
                                    covered_by, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          id,
          extra.trip ?? 't1',
          owner.item ?? null,
          owner.expense ?? null,
          who,
          extra.amount ?? null,
          extra.coveredBy ?? null,
          now,
          now,
        );
    const leave = (who: string) =>
      db.prepare(`DELETE FROM trip_travellers WHERE trip_id = 't1' AND traveller_id = ?`).run(who);

    it('refuses a share or a cover for someone not on the trip', () => {
      expect(() => share('x', 'solo', { item: 'husky' })).toThrow(/FOREIGN KEY/);
      expect(() => share('x', 'mia', { item: 'husky' }, { coveredBy: 'solo' })).toThrow(/FOREIGN KEY/);
      expect(() =>
        db.prepare(`INSERT INTO trip_cover (trip_id, child_id, adult_id) VALUES ('t1', 'mia', 'solo')`).run(),
      ).toThrow(/FOREIGN KEY/);
    });

    it('refuses a share with two owners, none, a negative amount, the same person twice, or self-cover', () => {
      expect(() => share('x', 'ev', { item: 'husky', expense: 'e2' })).toThrow(/CHECK/);
      expect(() => share('x', 'ev', {})).toThrow(/CHECK/);
      expect(() => share('x', 'ev', { item: 'husky' }, { amount: -1 })).toThrow(/CHECK/);
      expect(() => share('x', 'mia', { item: 'husky' }, { coveredBy: 'mia' })).toThrow(/CHECK/);
      share('a', 'ev', { item: 'husky' }, { amount: 0 }); // came along free
      expect(() => share('b', 'ev', { item: 'husky' })).toThrow(/UNIQUE/);
      share('c', 'ev', { expense: 'e2' }); // the same person on another cost
    });

    it('refuses removing a member who holds a share or covers one by override, keeping everything', () => {
      share('s1', 'mia', { item: 'husky' }, { coveredBy: 'ana' });
      const before = snapshot(db);
      expect(() => leave('mia')).toThrow(/FOREIGN KEY/);
      expect(() => leave('ana')).toThrow(/FOREIGN KEY/);
      expect(snapshot(db)).toEqual(before);
      expect(count(db, `SELECT COUNT(*) AS n FROM cost_shares`)).toBe(1);
    });

    it('lets a default cover go with either person', () => {
      db.prepare(
        `INSERT INTO trip_cover (trip_id, child_id, adult_id) VALUES ('t1', 'mia', 'ev'), ('t1', 'mia', 'ana')`,
      ).run();
      db.prepare(`UPDATE expenses SET payer_id = NULL`).run(); // Ana paid e1 in 3D-1: not this test's point
      leave('ana');
      expect(db.prepare(`SELECT adult_id FROM trip_cover`).all()).toEqual([{ adult_id: 'ev' }]);
      leave('mia');
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_cover`)).toBe(0);
    });

    it('takes a split with its booking or expense', () => {
      share('s1', 'ev', { item: 'husky' });
      share('s2', 'ev', { expense: 'e2' });
      db.prepare(`UPDATE expenses SET trip_item_id = NULL WHERE id = 'e1'`).run(); // unlink 3D-1's record
      db.prepare(`DELETE FROM trip_items WHERE id = 'husky'`).run();
      db.prepare(`DELETE FROM expenses WHERE id = 'e2'`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM cost_shares`)).toBe(0);
    });

    it('still refuses deleting a booking with payments, split or not', () => {
      share('s1', 'ev', { item: 'hotel' });
      expect(() => db.prepare(`DELETE FROM trip_items WHERE id = 'hotel'`).run()).toThrow(/FOREIGN KEY/);
      expect(count(db, `SELECT COUNT(*) AS n FROM cost_shares`)).toBe(1);
    });

    it('deletes a whole trip with its members, shares, covers and money in one statement', () => {
      share('s1', 'mia', { item: 'husky' }, { coveredBy: 'ana' });
      share('s2', 'ev', { expense: 'e2' }, { amount: 3500 });
      db.prepare(`INSERT INTO trip_cover (trip_id, child_id, adult_id) VALUES ('t1', 'mia', 'ev')`).run();
      db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
      for (const table of ['cost_shares', 'trip_cover', 'trip_items', 'booking_payments', 'expenses']) {
        expect([table, count(db, `SELECT COUNT(*) AS n FROM ${table}`)]).toEqual([table, 0]);
      }
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_travellers WHERE trip_id = 't2'`)).toBe(1);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    });
  });
});
