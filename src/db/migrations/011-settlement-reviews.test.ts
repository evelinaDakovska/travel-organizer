import Database from 'better-sqlite3';

import { addMoneyRecords, fillLikeAPhone } from '../testing/phoneShaped';
import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 011 runs on the owner's phone in the same start-up as 007–010 (the phone is on 0.13.0,
 * schema 6), and on a 0.16.1 install after 010. Both paths, over phone-shaped synthetic data.
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

/** A settlement and a cost kept outside: what a 0.16.1 phone can hold. */
function addSettlementAndConfirmation(db: Database.Database) {
  db.prepare(
    `INSERT INTO settlements (id, trip_id, from_id, to_id, amount, currency, settled_on, note, created_at, updated_at)
     VALUES ('st1', 't1', 'ana', 'ev', 5000, 'EUR', '2026-11-24', NULL, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO unsplit_confirmations (id, trip_id, trip_item_id, expense_id, fingerprint, confirmed_at)
     VALUES ('c1', 't1', 'hotel', NULL, '{}', ?)`,
  ).run(now);
}

/** Every table that existed before 011. */
function snapshot(db: Database.Database) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'settlement_reviews' ORDER BY name`)
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 011 — settlement review holds', () => {
  it('10 → 11 leaves every existing row exactly as it was; nothing is held', () => {
    const db = databaseAt(10);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addSettlementAndConfirmation(db);
    const before = snapshot(db);
    upgradeTo(db, 11);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(11);
    expect(count(db, `SELECT COUNT(*) AS n FROM settlement_reviews`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('6 → 11 in one start-up, as on the phone: old rows identical, new tables empty', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgradeTo(db, 11);
    expect(db.pragma('user_version', { simple: true })).toBe(11);
    const after = snapshot(db);
    for (const table of ['booking_payments', 'cost_shares', 'trip_cover', 'settlements', 'unsplit_confirmations']) {
      expect([table, after[table]]).toEqual([table, []]);
    }
    // The expenses gained 007's two columns, both NULL; nothing else in any old table changed.
    expect(after.expenses).toEqual(
      (before.expenses as object[]).map((row) => ({ ...row, trip_item_id: null, payer_id: null })),
    );
    for (const table of Object.keys(before).filter((name) => name !== 'expenses')) {
      expect([table, after[table]]).toEqual([table, before[table]]);
    }
    expect(count(db, `SELECT COUNT(*) AS n FROM settlement_reviews`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('leaves schema 10 untouched when the batch fails part-way', () => {
    const db = databaseAt(10);
    fillLikeAPhone(db);
    addSettlementAndConfirmation(db);
    const before = snapshot(db);
    // Forces the batch to fail at its last statement, after the table.
    db.exec(`CREATE INDEX idx_settlement_reviews_trip ON trips(id)`);
    expect(() => upgradeTo(db, 11)).toThrow();
    db.exec('DROP INDEX idx_settlement_reviews_trip');
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'settlement_reviews'`)).toBe(0);
  });

  it('runs once: a second start-up at 11 does nothing', () => {
    const db = databaseAt(10);
    fillLikeAPhone(db);
    upgradeTo(db, 11);
    const before = snapshot(db);
    upgradeTo(db, 11);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(11);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = databaseAt(10);
      fillLikeAPhone(db);
      addMoneyRecords(db);
      addSettlementAndConfirmation(db);
      upgradeTo(db, 11);
    });
    const review = (id: string, reason: string, toCurrency: string | null, trip = 't1') =>
      db
        .prepare(
          `INSERT INTO settlement_reviews (id, trip_id, currency, reason, cost_kind, cost_title, cost_amount,
                                           to_currency, created_at, acknowledged_at)
           VALUES (?, ?, 'EUR', ?, 'expense', 'Taxi', 3000, ?, ?, NULL)`,
        )
        .run(id, trip, reason, toCurrency, now);

    it('refuses an unknown reason or cost kind, a move without a destination, a destination without a move, another trip', () => {
      expect(() => review('x', 'guessed', null)).toThrow(/CHECK/);
      expect(() => review('x', 'moved', null)).toThrow(/CHECK/);
      expect(() => review('x', 'deleted', 'NOK')).toThrow(/CHECK/);
      expect(() => review('x', 'deleted', null, 'nowhere')).toThrow(/FOREIGN KEY/);
      expect(() =>
        db
          .prepare(
            `INSERT INTO settlement_reviews (id, trip_id, currency, reason, cost_kind, cost_title, cost_amount, created_at)
             VALUES ('y', 't1', 'EUR', 'left', 'plan', 'Hotel', 1, ?)`,
          )
          .run(now),
      ).toThrow(/CHECK/);
      review('ok1', 'deleted', null);
      review('ok2', 'moved', 'NOK');
      review('ok3', 'left', null);
      expect(count(db, `SELECT COUNT(*) AS n FROM settlement_reviews`)).toBe(3);
    });

    it('names no cost: deleting every cost leaves the reviews; deleting the trip removes them', () => {
      review('r1', 'deleted', null);
      db.prepare(`DELETE FROM booking_payments`).run();
      db.prepare(`DELETE FROM expenses`).run();
      db.prepare(`DELETE FROM trip_items`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM settlement_reviews`)).toBe(1);
      db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM settlement_reviews`)).toBe(0);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    });

    it('writing, acknowledging or deleting a review touches no other table', () => {
      const before = snapshot(db);
      review('r1', 'deleted', null);
      db.prepare(`UPDATE settlement_reviews SET acknowledged_at = ?`).run(now);
      db.prepare(`DELETE FROM settlement_reviews`).run();
      expect(snapshot(db)).toEqual(before);
    });
  });
});
