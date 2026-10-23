import Database from 'better-sqlite3';

import { addMoneyRecords, fillLikeAPhone } from '../testing/phoneShaped';
import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 013 runs on the owner's phone in the same start-up as 007–012 (schema 6, so `trip_rates`
 * is still empty), and on a 0.17.0 install after 012, where every saved rate must be copied.
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

function upgradeTo(db: Database.Database, version: number) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS.filter((m) => m.version > current && m.version <= version)) {
    db.transaction(() => db.exec(migrationBatch(migration)))();
  }
}

/** Every table but the new one. */
function snapshot(db: Database.Database) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'trip_exchange_rates' ORDER BY name`)
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

/** What a 0.17.0 install can hold: a reporting currency, rates, charged amounts. */
function addConversion(db: Database.Database) {
  db.prepare(`UPDATE trips SET report_currency = 'EUR' WHERE id = 't1'`).run();
  const rate = db.prepare(
    `INSERT INTO trip_rates (trip_id, currency, base_currency, rate, rate_date, updated_at) VALUES ('t1', ?, ?, ?, ?, ?)`,
  );
  rate.run('USD', 'EUR', '0.92', '2026-10-20', now);
  rate.run('NOK', 'GBP', '0.07', '2026-10-01', now);
  db.prepare(`UPDATE expenses SET charged_amount = 2600, charged_currency = 'USD' WHERE id = 'e1'`).run();
}

const pairs = (db: Database.Database, table = 'trip_exchange_rates') =>
  db.prepare(`SELECT trip_id, currency, base_currency, rate, rate_date, updated_at FROM ${table} ORDER BY currency, base_currency`).all();
const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 013 — a rate per currency pair', () => {
  it('12 → 13 copies every rate exactly and changes nothing else', () => {
    const db = databaseAt(12);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addConversion(db);
    const before = snapshot(db);
    upgradeTo(db, 13);
    expect(snapshot(db)).toEqual(before);
    expect(pairs(db)).toEqual(pairs(db, 'trip_rates'));
    expect(pairs(db)).toHaveLength(2);
    expect(db.pragma('user_version', { simple: true })).toBe(13);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('6 → 13 in one start-up, as on the phone: no rate anywhere, old rows identical', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const trips = db.prepare(`SELECT * FROM trips ORDER BY rowid`).all();
    upgradeTo(db, 13);
    expect(db.pragma('user_version', { simple: true })).toBe(13);
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_exchange_rates`)).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM trip_rates`)).toBe(0);
    expect(db.prepare(`SELECT * FROM trips ORDER BY rowid`).all()).toEqual(
      (trips as object[]).map((row) => ({ ...row, report_currency: null })),
    );
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('leaves schema 12 untouched when the batch fails part-way', () => {
    const db = databaseAt(12);
    fillLikeAPhone(db);
    addConversion(db);
    const before = snapshot(db);
    // The copy fails after the table is made: a rate the new CHECK refuses.
    db.exec(`DROP TABLE trip_rates; CREATE TABLE trip_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)`);
    db.prepare(`INSERT INTO trip_rates VALUES ('t1', 'usd', 'EUR', '1', '2026-10-23', ?)`).run(now);
    const broken = snapshot(db);
    expect(() => upgradeTo(db, 13)).toThrow(/CHECK/);
    expect(snapshot(db)).toEqual(broken);
    expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'trip_exchange_rates'`)).toBe(0);
    expect(db.pragma('user_version', { simple: true })).toBe(12);
    expect(before.trips).toEqual(broken.trips);
  });

  it('runs once: a second start-up at 13 does nothing', () => {
    const db = databaseAt(12);
    fillLikeAPhone(db);
    addConversion(db);
    upgradeTo(db, 13);
    const rates = pairs(db);
    upgradeTo(db, 13);
    expect(pairs(db)).toEqual(rates);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = databaseAt(12);
      fillLikeAPhone(db);
      upgradeTo(db, 13);
    });
    const insert = (currency: string, base: string, trip = 't1') =>
      db
        .prepare(
          `INSERT INTO trip_exchange_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)
           VALUES (?, ?, ?, '0.9', '2026-10-23', ?)`,
        )
        .run(trip, currency, base, now);

    it('holds one rate per pair: USD → EUR and USD → GBP side by side, a pair only once', () => {
      insert('USD', 'EUR');
      insert('USD', 'GBP');
      expect(() => insert('USD', 'EUR')).toThrow(/UNIQUE|PRIMARY/);
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_exchange_rates`)).toBe(2);
    });

    it('refuses malformed codes, a rate to itself and another trip; goes with its trip', () => {
      expect(() => insert('usd', 'EUR')).toThrow(/CHECK/);
      expect(() => insert('USD', 'EURO')).toThrow(/CHECK/);
      expect(() => insert('EUR', 'EUR')).toThrow(/CHECK/);
      expect(() => insert('USD', 'EUR', 'nowhere')).toThrow(/FOREIGN KEY/);
      insert('USD', 'EUR');
      for (const table of ['expenses', 'trip_items']) db.prepare(`DELETE FROM ${table}`).run();
      db.prepare(`DELETE FROM trips`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_exchange_rates`)).toBe(0);
    });
  });
});
