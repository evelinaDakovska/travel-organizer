import Database from 'better-sqlite3';

import { addMoneyRecords, fillLikeAPhone } from '../testing/phoneShaped';
import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 009 will run on the owner's phone right after 007 and 008, in the same start-up: the
 * phone is on 0.13.0 (schema 6). So these start from schema 6 shaped like it and run 007–009 as the
 * app does, and also from schema 8 carrying 3D-1 money records and 3D-2 splits — with values the
 * app never writes in the unused legacy fields, because real data is never assumed to be empty.
 */

const now = '2026-10-22T09:00:00.000Z';

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

/** Every table and column that existed before 009. */
function snapshot(db: Database.Database) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'settlements' ORDER BY name`)
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('migration 009 — settlements', () => {
  it('8 → 9 leaves every existing row exactly as it was, money records and legacy fields included', () => {
    const db = databaseAt(8);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    const before = snapshot(db);
    upgradeTo(db, 9);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(9);
    expect(count(db, `SELECT COUNT(*) AS n FROM settlements`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('6 → 9 in one start-up, as on the phone: every old row identical, nothing written', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const before = snapshot(db);
    upgradeTo(db, 9);
    expect(db.pragma('user_version', { simple: true })).toBe(9);
    const after = snapshot(db);
    for (const table of ['booking_payments', 'cost_shares', 'trip_cover']) {
      expect([table, after[table]]).toEqual([table, []]);
    }
    // The expenses gained 007's two columns, both NULL; nothing else in any old table changed.
    expect(after.expenses).toEqual(
      (before.expenses as object[]).map((row) => ({ ...row, trip_item_id: null, payer_id: null })),
    );
    for (const table of Object.keys(before).filter((name) => name !== 'expenses')) {
      expect([table, after[table]]).toEqual([table, before[table]]);
    }
    expect(count(db, `SELECT COUNT(*) AS n FROM settlements`)).toBe(0);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('leaves schema 8 untouched when the batch fails part-way', () => {
    const db = databaseAt(8);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    const before = snapshot(db);
    db.exec('CREATE INDEX idx_settlements_to ON trips(name)'); // forces the batch to fail at its end
    expect(() => upgradeTo(db, 9)).toThrow();
    db.exec('DROP INDEX idx_settlements_to');
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    expect(count(db, `SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'settlements'`)).toBe(0);
  });

  it('runs once: a second start-up at 9 does nothing', () => {
    const db = databaseAt(8);
    fillLikeAPhone(db);
    upgradeTo(db, 9);
    const before = snapshot(db);
    upgradeTo(db, 9);
    expect(snapshot(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(9);
  });

  describe('after the upgrade', () => {
    let db: Database.Database;
    beforeEach(() => {
      db = databaseAt(8);
      fillLikeAPhone(db);
      addMoneyRecords(db);
      upgradeTo(db, 9);
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
    const settle = (id: string, from: string, to: string, amount = 5000, trip = 't1') =>
      db
        .prepare(
          `INSERT INTO settlements (id, trip_id, from_id, to_id, amount, currency, settled_on, note,
                                    created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'EUR', NULL, NULL, ?, ?)`,
        )
        .run(id, trip, from, to, amount, now, now);
    const leave = (who: string) =>
      db.prepare(`DELETE FROM trip_travellers WHERE trip_id = 't1' AND traveller_id = ?`).run(who);

    it('refuses a settlement with someone not on the trip', () => {
      expect(() => settle('x', 'solo', 'ev')).toThrow(/FOREIGN KEY/);
      expect(() => settle('x', 'ev', 'solo')).toThrow(/FOREIGN KEY/);
      expect(() => settle('x', 'ev', 'ana', 5000, 't2')).toThrow(/FOREIGN KEY/);
    });

    it('refuses a settlement to oneself, of zero or below', () => {
      expect(() => settle('x', 'ev', 'ev')).toThrow(/CHECK/);
      expect(() => settle('x', 'ev', 'ana', 0)).toThrow(/CHECK/);
      expect(() => settle('x', 'ev', 'ana', -1)).toThrow(/CHECK/);
      settle('ok', 'ana', 'ev');
      expect(count(db, `SELECT COUNT(*) AS n FROM settlements`)).toBe(1);
    });

    it('refuses removing either person of a settlement, keeping everything', () => {
      db.prepare(`DELETE FROM trip_cover`).run();
      db.prepare(`DELETE FROM cost_shares`).run();
      db.prepare(`UPDATE expenses SET payer_id = NULL`).run();
      db.prepare(`UPDATE booking_payments SET payer_id = NULL`).run();
      settle('s', 'ana', 'ev');
      const before = snapshot(db);
      expect(() => leave('ana')).toThrow(/FOREIGN KEY/);
      expect(() => leave('ev')).toThrow(/FOREIGN KEY/);
      expect(snapshot(db)).toEqual(before);
      expect(count(db, `SELECT COUNT(*) AS n FROM settlements`)).toBe(1);
    });

    it('keeps settlements when a booking or an expense is deleted', () => {
      settle('s', 'ana', 'ev');
      db.prepare(`UPDATE expenses SET trip_item_id = NULL WHERE id = 'e1'`).run();
      db.prepare(`DELETE FROM trip_items WHERE id = 'husky'`).run();
      db.prepare(`DELETE FROM expenses`).run();
      expect(count(db, `SELECT COUNT(*) AS n FROM settlements`)).toBe(1);
    });

    it('deletes a whole trip with its members, money and settlements in one statement', () => {
      settle('s1', 'ana', 'ev');
      settle('s2', 'ev', 'mia', 1000);
      db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
      for (const table of ['settlements', 'cost_shares', 'trip_cover', 'booking_payments', 'expenses']) {
        expect([table, count(db, `SELECT COUNT(*) AS n FROM ${table}`)]).toEqual([table, 0]);
      }
      expect(count(db, `SELECT COUNT(*) AS n FROM trip_travellers WHERE trip_id = 't2'`)).toBe(1);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    });

    it('never touches the legacy name-based payments', () => {
      const before = db.prepare(`SELECT * FROM payments`).all();
      settle('s', 'ana', 'ev', 1750);
      expect(db.prepare(`SELECT * FROM payments`).all()).toEqual(before);
    });
  });
});
