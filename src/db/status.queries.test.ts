import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import { UPDATE_TRIP_ITEM_STATUS } from './queries';

const now = '2026-09-15T00:00:00.000Z';
const later = '2026-09-16T00:00:00.000Z';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);

  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t1', 'Milan', '2026-09-19', '2026-09-22', 'Europe/Rome', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO trip_items
       (id, trip_id, kind, status, title, start_local, start_precision, start_utc, notes,
        created_at, updated_at)
     VALUES ('i1', 't1', 'activity', 'confirmed', 'Duomo', '2026-09-20T10:30', 'time',
             '2026-09-20T08:30:00.000Z', 'Fast track', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO resources (id, trip_item_id, kind, subtype, label, stored_path, sort_order, created_at)
     VALUES ('r1', 'i1', 'file', 'ticket', 'E-ticket', 'media/r1.pdf', 0, ?)`,
  ).run(now);

  const setStatus = (status: string) =>
    db.prepare(UPDATE_TRIP_ITEM_STATUS).run({ id: 'i1', status, now: later });
  const row = () =>
    db
      .prepare(
        `SELECT status, start_local, start_utc, notes, updated_at FROM trip_items WHERE id = 'i1'`,
      )
      .get();

  return { db, setStatus, row };
}

describe('UPDATE_TRIP_ITEM_STATUS', () => {
  it('cancels without touching the dates, the notes or the attachments', () => {
    const { db, setStatus, row } = setup();
    setStatus('cancelled');

    expect(row()).toEqual({
      status: 'cancelled',
      start_local: '2026-09-20T10:30',
      start_utc: '2026-09-20T08:30:00.000Z',
      notes: 'Fast track',
      updated_at: later,
    });
    // The cancellation document is the reason the row is kept.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM resources WHERE trip_item_id = 'i1'`).get()).toEqual({
      n: 1,
    });
  });

  it('restores a cancelled item to confirmed', () => {
    const { setStatus, row } = setup();
    setStatus('cancelled');
    setStatus('confirmed');

    expect(row()).toMatchObject({ status: 'confirmed', start_local: '2026-09-20T10:30' });
  });

  it('refuses a status the schema does not know', () => {
    const { setStatus } = setup();
    expect(() => setStatus('booked')).toThrow(/CHECK constraint failed/);
  });
});
