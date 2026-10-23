import Database from 'better-sqlite3';

import { addMoneyRecords, fillLikeAPhone } from '../testing/phoneShaped';
import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 012 runs on the owner's phone in the same start-up as 007–011 (the phone is on 0.13.0,
 * schema 6), and on a 0.16.x install after 011. Both paths, over phone-shaped synthetic data.
 */

const now = '2026-10-23T09:00:00.000Z';

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

/** What 3E adds on 0.16.x: a settlement and an open review. */
function addSettlements(db: Database.Database) {
  db.prepare(
    `INSERT INTO settlements (id, trip_id, from_id, to_id, amount, currency, settled_on, note, created_at, updated_at)
     VALUES ('st1', 't1', 'ana', 'ev', 5000, 'EUR', '2026-11-24', NULL, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO settlement_reviews (id, trip_id, currency, reason, cost_kind, cost_title, cost_amount,
                                     to_currency, created_at, acknowledged_at)
     VALUES ('r1', 't1', 'EUR', 'deleted', 'expense', 'Taxi', 3000, NULL, ?, NULL)`,
  ).run(now);
}

/** Every table, every row, without the new table. */
function snapshot(db: Database.Database) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'trip_rates' ORDER BY name`)
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

/** The new columns, all NULL: what an untouched old row reads as after 012. */
const withNewColumns = (before: Record<string, unknown[]>) => ({
  ...before,
  trips: (before.trips as object[]).map((row) => ({ ...row, report_currency: null })),
  expenses: (before.expenses as object[]).map((row) => ({ ...row, charged_amount: null, charged_currency: null })),
  booking_payments: (before.booking_payments as object[]).map((row) => ({
    ...row,
    charged_amount: null,
    charged_currency: null,
  })),
});

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 012 — currency conversion', () => {
  it('11 → 12 leaves every existing value exactly as it was; nothing is converted', () => {
    const db = databaseAt(11);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addSettlements(db);
    const before = snapshot(db);
    upgradeTo(db, 12);
    expect(snapshot(db)).toEqual(withNewColumns(before));
    expect(db.pragma('user_version', { simple: true })).toBe(12);
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_rates`)).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM trips WHERE report_currency IS NOT NULL`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('6 → 12 in one start-up, as on the phone: old rows identical, new tables empty', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgradeTo(db, 12);
    expect(db.pragma('user_version', { simple: true })).toBe(12);
    const after = snapshot(db);
    for (const table of ['booking_payments', 'cost_shares', 'trip_cover', 'settlements', 'unsplit_confirmations',
      'settlement_reviews']) {
      expect([table, after[table]]).toEqual([table, []]);
    }
    expect(after.trips).toEqual((before.trips as object[]).map((row) => ({ ...row, report_currency: null })));
    // The expenses gained 007's and 012's columns, all NULL; nothing else in any old table changed.
    expect(after.expenses).toEqual(
      (before.expenses as object[]).map((row) => ({
        ...row,
        trip_item_id: null,
        payer_id: null,
        charged_amount: null,
        charged_currency: null,
      })),
    );
    for (const table of Object.keys(before).filter((name) => name !== 'expenses' && name !== 'trips')) {
      expect([table, after[table]]).toEqual([table, before[table]]);
    }
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_rates`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('leaves schema 11 untouched when the batch fails part-way', () => {
    const db = databaseAt(11);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    const before = snapshot(db);
    // Forces the batch to fail at its last statement, after the table and four columns.
    db.exec(`ALTER TABLE booking_payments ADD COLUMN charged_currency TEXT`);
    expect(() => upgradeTo(db, 12)).toThrow();
    db.exec(`ALTER TABLE booking_payments DROP COLUMN charged_currency`);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(11);
    expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'trip_rates'`)).toBe(0);
  });

  it('runs once: a second start-up at 12 does nothing', () => {
    const db = databaseAt(11);
    fillLikeAPhone(db);
    upgradeTo(db, 12);
    const before = snapshot(db);
    upgradeTo(db, 12);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(12);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = databaseAt(11);
      fillLikeAPhone(db);
      addMoneyRecords(db);
      upgradeTo(db, 12);
    });
    const rate = (currency: string, base: string, trip = 't1') =>
      db
        .prepare(
          `INSERT INTO trip_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)
           VALUES (?, ?, ?, '0.92', '2026-10-23', ?)`,
        )
        .run(trip, currency, base, now);

    it('refuses a malformed reporting currency or rate code, a rate to itself, another trip, a second rate', () => {
      expect(() => db.prepare(`UPDATE trips SET report_currency = 'eur'`).run()).toThrow(/CHECK/);
      expect(() => db.prepare(`UPDATE trips SET report_currency = 'EURO'`).run()).toThrow(/CHECK/);
      db.prepare(`UPDATE trips SET report_currency = 'EUR'`).run();
      expect(() => rate('usd', 'EUR')).toThrow(/CHECK/);
      expect(() => rate('USD', 'Eu')).toThrow(/CHECK/);
      expect(() => rate('EUR', 'EUR')).toThrow(/CHECK/);
      expect(() => rate('USD', 'EUR', 'nowhere')).toThrow(/FOREIGN KEY/);
      rate('USD', 'EUR');
      expect(() => rate('USD', 'EUR')).toThrow(/UNIQUE|PRIMARY/);
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_rates`)).toBe(1);
    });

    it('refuses a charged amount of zero or less', () => {
      expect(() => db.prepare(`UPDATE expenses SET charged_amount = 0, charged_currency = 'USD'`).run()).toThrow(/CHECK/);
      expect(() =>
        db.prepare(`UPDATE booking_payments SET charged_amount = -1, charged_currency = 'USD'`).run(),
      ).toThrow(/CHECK/);
      db.prepare(`UPDATE expenses SET charged_amount = 2600, charged_currency = 'USD' WHERE id = 'e1'`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM expenses WHERE charged_amount = 2600`)).toBe(1);
    });

    it('deleting the trip removes its rates', () => {
      rate('USD', 'EUR');
      for (const table of ['cost_shares', 'booking_payments', 'expenses', 'trip_items']) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_rates`)).toBe(0);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    });
  });
});
