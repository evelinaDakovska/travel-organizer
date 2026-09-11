import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import {
  INSERT_NOTE,
  SCHEDULE_TRIP_ITEM,
  SEARCH_TRIP_ITEMS,
  SEARCH_TRIP_NOTES,
  SELECT_BOOKINGS,
  SELECT_NOTES,
  SELECT_PLACES,
  SET_NOTE_PINNED,
  UPDATE_NOTE,
} from './queries';
import { searchPattern } from '../domain/search';
import type { NoteRow } from '../domain/note';
import type { TripItemRow } from '../domain/tripItem';

const now = '2026-09-11T00:00:00.000Z';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);
  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t1', 'Milan', '2026-09-19', '2026-09-22', 'Europe/Rome', ?, ?)`,
  ).run(now, now);

  const item = (row: Record<string, unknown>) =>
    db
      .prepare(
        `INSERT INTO trip_items
           (id, trip_id, kind, status, priority, title, start_local, start_precision, start_utc,
            notes, location_name, address, confirmation_code, created_at, updated_at)
         VALUES
           ($id, 't1', $kind, $status, $priority, $title, $startLocal, $startPrecision, $startUtc,
            $notes, $locationName, $address, $confirmationCode, $now, $now)`,
      )
      .run({
        kind: 'activity',
        status: 'idea',
        priority: null,
        startLocal: null,
        startPrecision: null,
        startUtc: null,
        notes: null,
        locationName: null,
        address: null,
        confirmationCode: null,
        now,
        ...row,
      });

  const note = (id: string, extra: Record<string, unknown> = {}) =>
    db.prepare(INSERT_NOTE).run({
      id,
      tripId: 't1',
      title: id,
      body: '',
      pinned: 0,
      now,
      ...extra,
    });

  const ids = (sql: string, params: object = { tripId: 't1' }) =>
    (db.prepare(sql).all(params) as { id: string }[]).map((r) => r.id);

  return { db, item, note, ids };
}

describe('SELECT_BOOKINGS', () => {
  it('shows only what is confirmed', () => {
    const { item, ids } = setup();
    item({ id: 'booked', status: 'confirmed', title: 'Duomo' });
    item({ id: 'idea', status: 'idea', title: 'Pave' });
    item({ id: 'gone', status: 'cancelled', title: 'Scala' });

    expect(ids(SELECT_BOOKINGS)).toEqual(['booked']);
  });

  it('puts dated bookings in order ahead of undated ones', () => {
    const { item, ids } = setup();
    item({ id: 'undated', status: 'confirmed', title: 'Transfer' });
    item({
      id: 'later',
      status: 'confirmed',
      title: 'Dinner',
      startLocal: '2026-09-19T19:30',
      startPrecision: 'time',
      startUtc: '2026-09-19T17:30:00.000Z',
    });
    item({
      id: 'earlier',
      status: 'confirmed',
      title: 'Flight',
      startLocal: '2026-09-19T06:10',
      startPrecision: 'time',
      startUtc: '2026-09-19T04:10:00.000Z',
    });

    expect(ids(SELECT_BOOKINGS)).toEqual(['earlier', 'later', 'undated']);
  });
});

describe('SELECT_PLACES', () => {
  it('shows only ideas, most wanted first, with unrated last', () => {
    const { item, ids } = setup();
    item({ id: 'maybe', priority: 'maybe', title: 'A' });
    item({ id: 'unrated', priority: null, title: 'B' });
    item({ id: 'must', priority: 'must', title: 'C' });
    item({ id: 'want', priority: 'want', title: 'D' });
    item({ id: 'booked', status: 'confirmed', priority: 'must', title: 'E' });

    expect(ids(SELECT_PLACES)).toEqual(['must', 'want', 'maybe', 'unrated']);
  });

  it('falls back to the title within one priority', () => {
    const { item, ids } = setup();
    item({ id: 'b', priority: 'must', title: 'Bar Basso' });
    item({ id: 'a', priority: 'must', title: 'A Place' });

    expect(ids(SELECT_PLACES)).toEqual(['a', 'b']);
  });

  it('keeps a dated idea in Places, since it is planned but not booked', () => {
    const { item, ids } = setup();
    item({
      id: 'dated',
      priority: 'want',
      title: 'Pave',
      startLocal: '2026-09-20',
      startPrecision: 'date',
      startUtc: '2026-09-19T22:00:00.000Z',
    });

    expect(ids(SELECT_PLACES)).toEqual(['dated']);
  });
});

describe('SCHEDULE_TRIP_ITEM', () => {
  it('promotes a place to a booking without moving the row', () => {
    const { db, item, ids } = setup();
    item({ id: 'pave', priority: 'want', title: 'Pave' });
    db.prepare(SCHEDULE_TRIP_ITEM).run({
      id: 'pave',
      startLocal: '2026-09-20T09:00',
      startTz: null,
      startPrecision: 'time',
      startUtc: '2026-09-20T07:00:00.000Z',
      status: 'confirmed',
      now: '2026-09-12T00:00:00.000Z',
    });

    const row = db.prepare(`SELECT * FROM trip_items WHERE id = 'pave'`).get() as TripItemRow;
    expect(row.start_utc).toBe('2026-09-20T07:00:00.000Z');
    expect(row.priority).toBe('want');
    expect(ids(SELECT_PLACES)).toEqual([]);
    expect(ids(SELECT_BOOKINGS)).toEqual(['pave']);
  });

  it('keeps its resources, which is the reason for one UPDATE over a copy', () => {
    const { db, item } = setup();
    item({ id: 'pave', title: 'Pave' });
    db.prepare(
      `INSERT INTO resources (id, trip_item_id, kind, subtype, label, url, created_at)
       VALUES ('r1', 'pave', 'link', 'maps', 'Maps', 'https://maps.example', ?)`,
    ).run(now);
    db.prepare(SCHEDULE_TRIP_ITEM).run({
      id: 'pave',
      startLocal: '2026-09-20',
      startTz: null,
      startPrecision: 'date',
      startUtc: '2026-09-19T22:00:00.000Z',
      status: 'confirmed',
      now,
    });

    expect(db.prepare(`SELECT COUNT(*) AS n FROM resources WHERE trip_item_id = 'pave'`).get())
      .toEqual({ n: 1 });
  });
});

describe('search', () => {
  const seeded = () => {
    const ctx = setup();
    ctx.item({ id: 'duomo', title: 'Duomo Fast Track', confirmationCode: 'ABC123' });
    ctx.item({ id: 'pave', title: 'Pave', notes: 'Recommended for pastries' });
    ctx.item({ id: 'hotel', title: 'Hotel', locationName: 'Via Duomo 4' });
    ctx.item({ id: 'parking', title: 'Parking', address: '12 Via Roma' });
    ctx.item({ id: 'discount', title: 'Museum 50% off voucher' });
    ctx.item({ id: 'gone', status: 'cancelled', title: 'Scala cancelled' });
    ctx.note('codes', { title: 'Door codes', body: 'Front door 4417' });
    return ctx;
  };

  const find = (ctx: ReturnType<typeof seeded>, sql: string, query: string) =>
    ctx.ids(sql, { tripId: 't1', q: searchPattern(query) });

  it('matches the title', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'Fast Track')).toEqual(['duomo']);
  });

  it('matches notes, location, address and a confirmation code', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'pastries')).toEqual(['pave']);
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'Via Roma')).toEqual(['parking']);
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'ABC123')).toEqual(['duomo']);
  });

  it('matches across fields at once, which is the point of one box', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'duomo').sort()).toEqual(['duomo', 'hotel']);
  });

  it('ignores case for ascii', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'DUOMO fast')).toEqual(['duomo']);
  });

  it('keeps a cancelled item findable, since its document is why the row was kept', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_ITEMS, 'Scala')).toEqual(['gone']);
  });

  it('treats a percent sign as text rather than a wildcard', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_ITEMS, '50%')).toEqual(['discount']);
    expect(find(ctx, SEARCH_TRIP_ITEMS, '%')).toEqual(['discount']);
  });

  it('searches notes as well, so nothing in a trip is unreachable', () => {
    const ctx = seeded();
    expect(find(ctx, SEARCH_TRIP_NOTES, '4417')).toEqual(['codes']);
    expect(find(ctx, SEARCH_TRIP_NOTES, 'Door')).toEqual(['codes']);
  });

  it('does not reach into another trip', () => {
    const ctx = seeded();
    ctx.db
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES ('t2', 'Other', '2026-10-01', '2026-10-05', 'Europe/Sofia', ?, ?)`,
      )
      .run(now, now);
    ctx.db
      .prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
         VALUES ('other', 't2', 'activity', 'idea', 'Duomo elsewhere', ?, ?)`,
      )
      .run(now, now);

    expect(find(ctx, SEARCH_TRIP_ITEMS, 'Duomo').sort()).toEqual(['duomo', 'hotel']);
  });
});

describe('notes', () => {
  it('lists pinned notes first, then by sort order', () => {
    const { note, ids } = setup();
    note('first');
    note('second');
    note('pinned', { pinned: 1 });

    expect(ids(SELECT_NOTES)).toEqual(['pinned', 'first', 'second']);
  });

  it('numbers sort order from zero within a trip', () => {
    const { db, note } = setup();
    note('a');
    note('b');

    expect(
      (db.prepare(SELECT_NOTES).all({ tripId: 't1' }) as NoteRow[]).map((r) => r.sort_order),
    ).toEqual([0, 1]);
  });

  it('updates a note and pins it separately', () => {
    const { db, note } = setup();
    note('n1');
    db.prepare(UPDATE_NOTE).run({
      id: 'n1',
      title: 'Door codes',
      body: '4417',
      pinned: 0,
      now: '2026-09-12T00:00:00.000Z',
    });
    db.prepare(SET_NOTE_PINNED).run({ id: 'n1', pinned: 1, now: '2026-09-13T00:00:00.000Z' });

    const row = db.prepare(`SELECT * FROM trip_notes WHERE id = 'n1'`).get() as NoteRow;
    expect([row.title, row.body, row.pinned, row.updated_at]).toEqual([
      'Door codes',
      '4417',
      1,
      '2026-09-13T00:00:00.000Z',
    ]);
  });

  it('cascades away with its trip', () => {
    const { db, note, ids } = setup();
    note('n1');
    db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();

    expect(ids(SELECT_NOTES)).toEqual([]);
  });
});
