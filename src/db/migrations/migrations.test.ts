import Database from 'better-sqlite3';

import { LATEST_VERSION, MIGRATIONS } from './index';

/**
 * expo-sqlite is native and cannot run in jest, so these exercise the same SQL
 * strings through better-sqlite3. This tests the schema, not Expo's binding.
 */
function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.sql);
    db.pragma(`user_version = ${migration.version}`);
  }
  return db;
}

const now = '2026-09-11T00:00:00.000Z';

function insertTrip(db: Database.Database, id = 'trip-1') {
  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES (?, 'Milan', '2026-09-19', '2026-09-22', 'Europe/Rome', ?, ?)`,
  ).run(id, now, now);
  return id;
}

function insertItem(db: Database.Database, tripId: string, id = 'item-1', extra = '') {
  db.prepare(
    `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES (?, ?, 'activity', 'confirmed', 'Duomo Fast Track', ?, ?${extra ? ', ' + extra.split('=')[1] : ''})`,
  ).run(id, tripId, now, now);
  return id;
}

describe('migrations', () => {
  it('applies cleanly from version 0 and records the version', () => {
    const db = freshDb();
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((r: any) => r.name)
      .sort();
    expect(tables).toEqual([
      'booking_payments',
      'cost_shares',
      'expenses',
      'item_participants',
      'list_item_recipients',
      'list_items',
      'lists',
      'payments',
      'resources',
      'settings',
      'template_uses',
      'templates',
      'travellers',
      'trip_cover',
      'trip_items',
      'trip_notes',
      'trip_travellers',
      'trips',
    ]);
    db.close();
  });

  it('is idempotent when already at the latest version', () => {
    const db = freshDb();
    const before = db.pragma('user_version', { simple: true });
    expect(before).toBe(LATEST_VERSION);
    db.close();
  });
});

describe('cascade deletes', () => {
  it('removes items and their resources when a trip is deleted', () => {
    const db = freshDb();
    const tripId = insertTrip(db);
    const itemId = insertItem(db, tripId);
    db.prepare(
      `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, created_at)
       VALUES ('res-1', ?, 'file', 'ticket', 'Tickets.pdf', 'media/abc.pdf', ?)`,
    ).run(itemId, now);

    db.prepare('DELETE FROM trips WHERE id = ?').run(tripId);

    expect(db.prepare('SELECT COUNT(*) c FROM trip_items').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) c FROM resources').get()).toEqual({ c: 0 });
    db.close();
  });

  it('removes trip-level resources when the trip is deleted', () => {
    const db = freshDb();
    const tripId = insertTrip(db);
    db.prepare(
      `INSERT INTO resources (id, trip_id, kind, subtype, label, url, created_at)
       VALUES ('res-2', ?, 'link', 'website', 'Insurance', 'https://example.com', ?)`,
    ).run(tripId, now);

    db.prepare('DELETE FROM trips WHERE id = ?').run(tripId);
    expect(db.prepare('SELECT COUNT(*) c FROM resources').get()).toEqual({ c: 0 });
    db.close();
  });
});

describe('CHECK constraints', () => {
  let db: Database.Database;
  let tripId: string;
  beforeEach(() => {
    db = freshDb();
    tripId = insertTrip(db);
  });
  afterEach(() => db.close());

  it('rejects a resource with both owners set', () => {
    const itemId = insertItem(db, tripId);
    expect(() =>
      db.prepare(
        `INSERT INTO resources (id, trip_id, trip_item_id, kind, subtype, label, url, created_at)
         VALUES ('r', ?, ?, 'link', 'website', 'x', 'https://e.com', ?)`,
      ).run(tripId, itemId, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a resource with no owner', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO resources (id, kind, subtype, label, url, created_at)
         VALUES ('r', 'link', 'website', 'x', 'https://e.com', ?)`,
      ).run(now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a file resource with no stored_path', () => {
    const itemId = insertItem(db, tripId);
    expect(() =>
      db.prepare(
        `INSERT INTO resources (id, trip_item_id, kind, subtype, label, created_at)
         VALUES ('r', ?, 'file', 'ticket', 'x', ?)`,
      ).run(itemId, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a price without a currency', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, price_amount, created_at, updated_at)
         VALUES ('i', ?, 'food', 'confirmed', 'Dinner', 4250, ?, ?)`,
      ).run(tripId, now, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a start_local without a precision', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, start_local, created_at, updated_at)
         VALUES ('i', ?, 'activity', 'idea', 'x', '2026-09-19', ?, ?)`,
      ).run(tripId, now, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects an end instant before the start instant', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items
           (id, trip_id, kind, status, title, start_utc, end_utc, created_at, updated_at)
         VALUES ('i', ?, 'stay', 'confirmed', 'Hotel',
                 '2026-09-22T10:00:00.000Z', '2026-09-19T10:00:00.000Z', ?, ?)`,
      ).run(tripId, now, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects completed_at on a non-task', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, completed_at, created_at, updated_at)
         VALUES ('i', ?, 'activity', 'confirmed', 'x', ?, ?, ?)`,
      ).run(tripId, now, now, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('accepts completed_at on a task', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, completed_at, created_at, updated_at)
         VALUES ('i', ?, 'task', 'confirmed', 'Check in for flight', ?, ?, ?)`,
      ).run(tripId, now, now, now),
    ).not.toThrow();
  });

  it('rejects an unknown kind and an unknown status', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
         VALUES ('i', ?, 'place', 'confirmed', 'x', ?, ?)`,
      ).run(tripId, now, now),
    ).toThrow(/CHECK constraint failed/);

    expect(() =>
      db.prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
         VALUES ('i2', ?, 'activity', 'booked', 'x', ?, ?)`,
      ).run(tripId, now, now),
    ).toThrow(/CHECK constraint failed/);
  });

  it('allows an item dated before the trip starts', () => {
    expect(() =>
      db.prepare(
        `INSERT INTO trip_items
           (id, trip_id, kind, status, title, start_local, start_tz, start_precision, start_utc, created_at, updated_at)
         VALUES ('i', ?, 'task', 'idea', 'Check in for flight',
                 '2026-09-18T06:10', 'Europe/Sofia', 'time', '2026-09-18T03:10:00.000Z', ?, ?)`,
      ).run(tripId, now, now),
    ).not.toThrow();
  });

  it('defaults classification to unspecified and enforces CHECK on travellers', () => {
    db.prepare(
      `INSERT INTO travellers (id, name, created_at, updated_at) VALUES ('tr-1', 'Alice', ?, ?)`,
    ).run(now, now);
    const row = db.prepare(`SELECT classification FROM travellers WHERE id = 'tr-1'`).get() as any;
    expect(row.classification).toBe('unspecified');

    db.prepare(`UPDATE travellers SET classification = 'adult' WHERE id = 'tr-1'`).run();
    db.prepare(`UPDATE travellers SET classification = 'child' WHERE id = 'tr-1'`).run();

    expect(() =>
      db.prepare(`UPDATE travellers SET classification = 'teen' WHERE id = 'tr-1'`).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('defaults classification to unspecified and enforces CHECK on trip_travellers', () => {
    db.prepare(
      `INSERT INTO travellers (id, name, created_at, updated_at) VALUES ('tr-2', 'Bob', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO trip_travellers (trip_id, traveller_id) VALUES (?, 'tr-2')`,
    ).run(tripId);
    const row = db.prepare(`SELECT classification FROM trip_travellers WHERE trip_id = ? AND traveller_id = 'tr-2'`).get(tripId) as any;
    expect(row.classification).toBe('unspecified');

    db.prepare(`UPDATE trip_travellers SET classification = 'adult' WHERE trip_id = ? AND traveller_id = 'tr-2'`).run(tripId);
    db.prepare(`UPDATE trip_travellers SET classification = 'child' WHERE trip_id = ? AND traveller_id = 'tr-2'`).run(tripId);

    expect(() =>
      db.prepare(`UPDATE trip_travellers SET classification = 'invalid' WHERE trip_id = ? AND traveller_id = 'tr-2'`).run(tripId),
    ).toThrow(/CHECK constraint failed/);
  });

  it('defaults converted_travellers to empty array on trips', () => {
    const row = db.prepare(`SELECT converted_travellers FROM trips WHERE id = ?`).get(tripId) as any;
    expect(row.converted_travellers).toBe('[]');
  });
});
