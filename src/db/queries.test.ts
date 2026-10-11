import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import { COUNT_TRIP_CONTENTS } from './queries';

const now = '2026-09-11T00:00:00.000Z';

function seed() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);

  const trip = (id: string) =>
    db.prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES (?, ?, '2026-09-19', '2026-09-22', 'Europe/Rome', ?, ?)`,
    ).run(id, id, now, now);

  const item = (id: string, tripId: string) =>
    db.prepare(
      `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
       VALUES (?, ?, 'activity', 'confirmed', ?, ?, ?)`,
    ).run(id, tripId, id, now, now);

  const fileOnItem = (id: string, itemId: string) =>
    db.prepare(
      `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, created_at)
       VALUES (?, ?, 'file', 'ticket', ?, ?, ?)`,
    ).run(id, itemId, id, `media/${id}.pdf`, now);

  const linkOnItem = (id: string, itemId: string) =>
    db.prepare(
      `INSERT INTO resources (id, trip_item_id, kind, subtype, label, url, created_at)
       VALUES (?, ?, 'link', 'website', ?, 'https://example.com', ?)`,
    ).run(id, itemId, id, now);

  const fileOnTrip = (id: string, tripId: string) =>
    db.prepare(
      `INSERT INTO resources (id, trip_id, kind, subtype, label, stored_path, created_at)
       VALUES (?, ?, 'file', 'confirmation', ?, ?, ?)`,
    ).run(id, tripId, id, `media/${id}.pdf`, now);

  return { db, trip, item, fileOnItem, linkOnItem, fileOnTrip };
}

/** Items and files; expenses are counted in expenses.queries.test.ts. */
const count = (db: Database.Database, id: string) => {
  const { items, files } = db.prepare(COUNT_TRIP_CONTENTS).get({ id }) as {
    items: number;
    files: number;
  };
  return { items, files };
};

describe('COUNT_TRIP_CONTENTS', () => {
  it('is zero for an empty trip', () => {
    const { db, trip } = seed();
    trip('milan');
    expect(count(db, 'milan')).toEqual({ items: 0, files: 0 });
    db.close();
  });

  it('counts files on items and on the trip itself', () => {
    const { db, trip, item, fileOnItem, fileOnTrip } = seed();
    trip('milan');
    item('duomo', 'milan');
    fileOnItem('ticket', 'duomo');
    fileOnTrip('insurance', 'milan');
    expect(count(db, 'milan')).toEqual({ items: 1, files: 2 });
    db.close();
  });

  it('ignores links — only real files are at risk of being lost', () => {
    const { db, trip, item, fileOnItem, linkOnItem } = seed();
    trip('milan');
    item('duomo', 'milan');
    fileOnItem('ticket', 'duomo');
    linkOnItem('website', 'duomo');
    expect(count(db, 'milan')).toEqual({ items: 1, files: 1 });
    db.close();
  });

  it('does not leak counts from another trip', () => {
    const { db, trip, item, fileOnItem, fileOnTrip } = seed();
    trip('milan');
    trip('lapland');
    item('duomo', 'milan');
    fileOnItem('ticket', 'duomo');
    item('santa', 'lapland');
    fileOnItem('train', 'santa');
    fileOnTrip('insurance', 'lapland');

    expect(count(db, 'milan')).toEqual({ items: 1, files: 1 });
    expect(count(db, 'lapland')).toEqual({ items: 1, files: 2 });
    db.close();
  });
});
