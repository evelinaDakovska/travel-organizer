import Database from 'better-sqlite3';

import { addMoneyRecords, fillLikeAPhone } from '../testing/phoneShaped';
import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 010 runs on the owner's phone in the same start-up as 007–009 (the phone is on 0.13.0,
 * schema 6), and on a 0.16.0 install after 009. Both paths, over phone-shaped synthetic data.
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

function addSettlement(db: Database.Database) {
  db.prepare(
    `INSERT INTO settlements (id, trip_id, from_id, to_id, amount, currency, settled_on, note, created_at, updated_at)
     VALUES ('st1', 't1', 'ana', 'ev', 5000, 'EUR', '2026-11-24', NULL, ?, ?)`,
  ).run(now, now);
}

/** Every table that existed before 010. */
function snapshot(db: Database.Database) {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'unsplit_confirmations' ORDER BY name`,
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 010 — unsplit confirmations', () => {
  it('9 → 10 leaves every existing row exactly as it was, settlements and money records included', () => {
    const db = databaseAt(9);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addSettlement(db);
    const before = snapshot(db);
    upgradeTo(db, 10);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    expect(count(db, `SELECT COUNT(*) AS n FROM unsplit_confirmations`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('6 → 10 in one start-up, as on the phone: old rows identical, nothing written', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgradeTo(db, 10);
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    const after = snapshot(db);
    for (const table of ['booking_payments', 'cost_shares', 'trip_cover', 'settlements']) {
      expect([table, after[table]]).toEqual([table, []]);
    }
    // The expenses gained 007's two columns, both NULL; nothing else in any old table changed.
    expect(after.expenses).toEqual(
      (before.expenses as object[]).map((row) => ({ ...row, trip_item_id: null, payer_id: null })),
    );
    for (const table of Object.keys(before).filter((name) => name !== 'expenses')) {
      expect([table, after[table]]).toEqual([table, before[table]]);
    }
    expect(count(db, `SELECT COUNT(*) AS n FROM unsplit_confirmations`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('leaves schema 9 untouched when the batch fails part-way', () => {
    const db = databaseAt(9);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addSettlement(db);
    const before = snapshot(db);
    // Forces the batch to fail at its last statement, after the table and two triggers.
    db.exec(`CREATE TRIGGER trg_cost_shares_delete_unconfirms AFTER DELETE ON trips BEGIN SELECT 1; END`);
    expect(() => upgradeTo(db, 10)).toThrow();
    db.exec('DROP TRIGGER trg_cost_shares_delete_unconfirms');
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(9);
    expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'unsplit_confirmations'`)).toBe(0);
    expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`)).toBe(0);
  });

  it('runs once: a second start-up at 10 does nothing', () => {
    const db = databaseAt(9);
    fillLikeAPhone(db);
    upgradeTo(db, 10);
    const before = snapshot(db);
    upgradeTo(db, 10);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(10);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = databaseAt(9);
      fillLikeAPhone(db);
      addMoneyRecords(db);
      upgradeTo(db, 10);
    });
    const confirm = (id: string, item: string | null, expense: string | null) =>
      db
        .prepare(
          `INSERT INTO unsplit_confirmations (id, trip_id, trip_item_id, expense_id, fingerprint, confirmed_at)
           VALUES (?, 't1', ?, ?, '{}', ?)`,
        )
        .run(id, item, expense, now);
    const confirmations = () =>
      (db.prepare(`SELECT id FROM unsplit_confirmations ORDER BY id`).all() as { id: string }[]).map((r) => r.id);
    const share = (id: string, item: string | null, expense: string | null) =>
      db
        .prepare(
          `INSERT INTO cost_shares (id, trip_id, trip_item_id, expense_id, traveller_id, amount, covered_by,
                                    sort_order, created_at, updated_at)
           VALUES (?, 't1', ?, ?, 'ana', NULL, NULL, 5, ?, ?)`,
        )
        .run(id, item, expense, now, now);

    it('refuses a confirmation of both or neither, of a missing cost, and a second for one cost', () => {
      expect(() => confirm('x', 'hotel', 'e2')).toThrow(/CHECK/);
      expect(() => confirm('x', null, null)).toThrow(/CHECK/);
      expect(() => confirm('x', 'nowhere', null)).toThrow(/FOREIGN KEY/);
      expect(() => confirm('x', null, 'nowhere')).toThrow(/FOREIGN KEY/);
      confirm('c1', 'hotel', null);
      expect(() => confirm('c2', 'hotel', null)).toThrow(/UNIQUE/);
      confirm('c3', null, 'e2');
      expect(() => confirm('c4', null, 'e2')).toThrow(/UNIQUE/);
      expect(confirmations()).toEqual(['c1', 'c3']);
    });

    it('a split made, changed or removed ends that cost’s confirmation, and no other', () => {
      confirm('hotel-c', 'hotel', null);
      confirm('taxi-c', null, 'e2');
      share('sh', 'hotel', null);
      expect(confirmations()).toEqual(['taxi-c']);

      confirm('hotel-c', 'hotel', null);
      db.prepare(`UPDATE cost_shares SET amount = 100 WHERE id = 'sh'`).run();
      expect(confirmations()).toEqual(['taxi-c']);

      confirm('hotel-c', 'hotel', null);
      db.prepare(`DELETE FROM cost_shares WHERE id = 'sh'`).run();
      expect(confirmations()).toEqual(['taxi-c']);

      share('sh2', null, 'e2');
      expect(confirmations()).toEqual([]);
    });

    it('a confirmation goes with its booking, its expense, or the whole trip — settlements untouched', () => {
      addSettlement(db);
      confirm('hotel-c', 'hotel', null);
      confirm('taxi-c', null, 'e2');
      const settlementsBefore = db.prepare(`SELECT * FROM settlements`).all();
      db.prepare(`DELETE FROM booking_payments WHERE trip_item_id = 'hotel'`).run();
      db.prepare(`DELETE FROM trip_items WHERE id = 'hotel'`).run();
      expect(confirmations()).toEqual(['taxi-c']);
      db.prepare(`DELETE FROM expenses WHERE id = 'e2'`).run();
      expect(confirmations()).toEqual([]);
      expect(db.prepare(`SELECT * FROM settlements`).all()).toEqual(settlementsBefore);

      confirm('husky-c', 'husky', null);
      db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
      expect(confirmations()).toEqual([]);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    });

    it('writing or deleting a confirmation touches no other table', () => {
      const before = snapshot(db);
      confirm('c', 'hotel', null);
      db.prepare(`DELETE FROM unsplit_confirmations`).run();
      expect(snapshot(db)).toEqual(before);
    });
  });
});
