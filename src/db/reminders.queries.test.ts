import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import { SELECT_REMINDER_CANDIDATES } from './queries';

const created = '2026-09-15T00:00:00.000Z';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);

  const trip = db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES (?, ?, '2026-09-19', '2026-09-22', 'Europe/Rome', ?, ?)`,
  );
  trip.run('milan', 'Milan', created, created);
  trip.run('lapland', 'Lapland', created, created);

  const add = db.prepare(
    `INSERT INTO trip_items
       (id, trip_id, kind, status, title, start_local, start_precision, start_utc,
        created_at, updated_at)
     VALUES ($id, $trip, 'activity', $status, $id, $local, $precision, $utc, $at, $at)`,
  );
  const item = (id: string, trip: string, status: string, utc: string | null) =>
    add.run({
      id,
      trip,
      status,
      local: utc ? '2026-09-20T10:00' : null,
      precision: utc ? 'time' : null,
      utc,
      at: created,
    });

  item('upcoming', 'milan', 'confirmed', '2026-09-20T08:00:00.000Z');
  item('other-trip', 'lapland', 'confirmed', '2026-09-19T12:00:00.000Z');
  item('started', 'milan', 'confirmed', '2026-09-19T07:00:00.000Z');
  item('idea', 'milan', 'idea', '2026-09-20T09:00:00.000Z');
  item('cancelled', 'milan', 'cancelled', '2026-09-20T09:00:00.000Z');
  item('undated', 'milan', 'confirmed', null);

  const ids = (now: string) =>
    (db.prepare(SELECT_REMINDER_CANDIDATES).all({ now }) as { id: string }[]).map((r) => r.id);

  return { ids };
}

describe('SELECT_REMINDER_CANDIDATES', () => {
  it('returns booked, dated items that have not started, from every trip, soonest first', () => {
    expect(setup().ids('2026-09-19T08:00:00.000Z')).toEqual(['other-trip', 'upcoming']);
  });
});
