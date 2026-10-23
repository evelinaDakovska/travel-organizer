import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrate } from '../client';
import { addMoneyRecords, fillLikeAPhone } from '../testing/phoneShaped';
import { asyncDatabase } from '../testing/asyncDatabase';
import { migrationBatch, MIGRATIONS } from './index';

/**
 * Migration 014 rebuilds `trips`, the table every other one references. It runs on the owner's
 * phone in the same start-up as 007–013 (schema 6), and on a 0.18.x install after 013. Every row of
 * every table must come through unchanged, and nothing may cascade.
 */

const now = '2026-10-23T09:00:00.000Z';

/** Up to `version` the way the app's runner does it: 014 with foreign keys off, the rest on. */
function upgradeTo(db: Database.Database, version: number) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS.filter((m) => m.version > current && m.version <= version)) {
    if (migration.rebuildsTables) db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(migrationBatch(migration));
      expect(db.pragma('foreign_key_check')).toEqual([]);
    })();
    db.pragma('foreign_keys = ON');
  }
}

function databaseAt(version: number) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  upgradeTo(db, version);
  return db;
}

function snapshot(db: Database.Database) {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
  );
}

const columns = (db: Database.Database, table: string) =>
  (db.pragma(`table_info(${table})`) as { name: string; notnull: number; dflt_value: unknown }[]).map(
    ({ name, notnull, dflt_value }) => ({ name, notnull, dflt_value }),
  );

/** A 0.18.x trip on top of the phone's: conversion, a rate, a plan. */
function addLaterRecords(db: Database.Database) {
  db.prepare(`UPDATE trips SET report_currency = 'EUR', converted_travellers = '["Ana"]' WHERE id = 't1'`).run();
  db.prepare(
    `INSERT INTO trip_exchange_rates (trip_id, currency, base_currency, rate, rate_date, updated_at)
     VALUES ('t1', 'USD', 'EUR', '0.92', '2026-10-20', ?)`,
  ).run(now);
  db.prepare(
    `INSERT INTO trips (id, name, destination, start_date, end_date, default_tz, notes, traveller_count,
                        travellers, created_at, updated_at)
     VALUES ('t2', 'Rome', 'Italy', '2027-04-01', '2027-04-05', 'Europe/Rome', 'Spring', 2, '["Ana"]', ?, ?)`,
  ).run(now, now);
}

const count = (db: Database.Database, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('migration 014 — trips without dates', () => {
  it('13 → 14 keeps every row of every table, and the columns in the same order', () => {
    const db = databaseAt(13);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addLaterRecords(db);
    const before = snapshot(db);
    const tripColumns = columns(db, 'trips').map((c) => c.name);
    upgradeTo(db, 14);
    expect(snapshot(db)).toEqual(before);
    expect(columns(db, 'trips').map((c) => c.name)).toEqual(tripColumns);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'trips_new'`).all()).toEqual([]);
  });

  it('only the dates become nullable; every other column keeps its rules', () => {
    const db = databaseAt(13);
    const before = columns(db, 'trips');
    upgradeTo(db, 14);
    const after = columns(db, 'trips');
    expect(after).toEqual(
      before.map((c) => (c.name === 'start_date' || c.name === 'end_date' ? { ...c, notnull: 0 } : c)),
    );
  });

  it('6 → 14 in one start-up, as on the phone', () => {
    const db = databaseAt(6);
    fillLikeAPhone(db);
    const items = db.prepare(`SELECT * FROM trip_items ORDER BY rowid`).all();
    upgradeTo(db, 14);
    expect(db.pragma('user_version', { simple: true })).toBe(14);
    expect(db.prepare(`SELECT * FROM trip_items ORDER BY rowid`).all()).toEqual(items);
    expect(db.prepare(`SELECT start_date, end_date FROM trips`).all()).toEqual([
      { start_date: '2026-11-20', end_date: '2026-11-24' },
    ]);
  });

  it('children still reference the new table: deleting a trip cascades, an unknown trip is refused', () => {
    const db = databaseAt(13);
    fillLikeAPhone(db);
    addMoneyRecords(db);
    addLaterRecords(db);
    upgradeTo(db, 14);
    expect(() =>
      db
        .prepare(
          `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
           VALUES ('x', 'nowhere', 'other', 'idea', 'X', ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/FOREIGN KEY/);
    // The money records are cleared first, as the app does: a booking with them cannot go alone.
    for (const table of ['cost_shares', 'trip_cover', 'booking_payments', 'expenses']) {
      db.prepare(`DELETE FROM ${table} WHERE trip_id = 't1'`).run();
    }
    db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
    for (const table of ['trip_items', 'trip_travellers', 'trip_exchange_rates', 'payments']) {
      expect([table, count(db, table)]).toEqual([table, 0]);
    }
    expect(count(db, 'trips')).toBe(1);
  });

  it('a trip is dated or undated, never half', () => {
    const db = databaseAt(14);
    const insert = (id: string, start: string | null, end: string | null) =>
      db
        .prepare(
          `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
           VALUES (?, 'T', ?, ?, 'Europe/Sofia', ?, ?)`,
        )
        .run(id, start, end, now, now);
    insert('undated', null, null);
    insert('dated', '2027-01-01', '2027-01-03');
    expect(() => insert('start-only', '2027-01-01', null)).toThrow(/CHECK/);
    expect(() => insert('end-only', null, '2027-01-01')).toThrow(/CHECK/);
    expect(() => insert('backwards', '2027-01-03', '2027-01-01')).toThrow(/CHECK/);
    expect(() =>
      db.prepare(`UPDATE trips SET report_currency = 'eur' WHERE id = 'dated'`).run(),
    ).toThrow(/CHECK/);
  });

  describe('through the app runner', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'migrate-014-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const open = (file: string) => {
      const db = new Database(file);
      return { db, async: asyncDatabase(db, { openConnection: () => new Database(file) }) };
    };

    it('upgrades a filled 13 without losing a row, and leaves foreign keys on', async () => {
      const file = join(dir, 'a.db');
      const seed = new Database(file);
      seed.pragma('foreign_keys = ON');
      upgradeTo(seed, 13);
      fillLikeAPhone(seed);
      addMoneyRecords(seed);
      addLaterRecords(seed);
      const before = snapshot(seed);
      seed.close();

      const { db, async } = open(file);
      await migrate(async);
      expect(db.pragma('user_version', { simple: true })).toBe(14);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(snapshot(db)).toEqual(before);
      db.close();
    });

    it('a reference already broken in the file is carried over, not a reason never to start', async () => {
      const file = join(dir, 'b.db');
      const seed = new Database(file);
      seed.pragma('foreign_keys = ON');
      upgradeTo(seed, 13);
      fillLikeAPhone(seed);
      seed.pragma('foreign_keys = OFF');
      seed
        .prepare(
          `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
           VALUES ('orphan', 'gone', 'other', 'idea', 'Orphan', ?, ?)`,
        )
        .run(now, now);
      const before = snapshot(seed);
      seed.close();

      const { db, async } = open(file);
      await migrate(async);
      expect(db.pragma('user_version', { simple: true })).toBe(14);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(snapshot(db)).toEqual(before);
      db.close();
    });

    it('a rebuild that breaks references is rolled back, leaving 13 and foreign keys on', async () => {
      const file = join(dir, 'c.db');
      const seed = new Database(file);
      seed.pragma('foreign_keys = ON');
      upgradeTo(seed, 13);
      fillLikeAPhone(seed);
      const before = snapshot(seed);
      seed.close();

      const { db, async } = open(file);
      // A stand-in for a wrong rebuild: one that loses the trips.
      const migration = MIGRATIONS.find((m) => m.version === 14)!;
      const original = migration.sql;
      migration.sql = original.replace('  FROM trips;', '  FROM trips WHERE 0;');
      try {
        await expect(migrate(async)).rejects.toThrow(/broke references/);
      } finally {
        migration.sql = original;
      }
      expect(db.pragma('user_version', { simple: true })).toBe(13);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(snapshot(db)).toEqual(before);
      db.close();
    });
  });
});
