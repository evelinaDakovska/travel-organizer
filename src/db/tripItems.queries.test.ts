import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import {
  INSERT_TRIP_ITEM,
  SELECT_ITEMS_WITH_DEFAULT_TZ,
  SELECT_KNOWN_PLACES,
  SELECT_TRIP_ITEM,
  SELECT_TRIP_ITEMS,
  SET_TASK_COMPLETED,
  UPDATE_ITEM_INSTANTS,
  UPDATE_TRIP_ITEM,
} from './queries';
import { parseTripItemRow, tripItemBindings, tripItemInputSchema } from '../domain/tripItem';
import type { TripItemRow } from '../domain/tripItem';

const ROME = 'Europe/Rome';
const now = '2026-09-11T00:00:00.000Z';
const schema = tripItemInputSchema(ROME);

/** better-sqlite3 binds named parameters without the `$` the statements spell them with. */
const strip = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k.replace(/^\$/, ''), v]));

function setup(defaultTz = ROME) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);
  db.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES ('t1', 'Milan', '2026-09-19', '2026-09-22', ?, ?, ?)`,
  ).run(defaultTz, now, now);

  const insert = (id: string, input: unknown, tz = defaultTz) =>
    db
      .prepare(INSERT_TRIP_ITEM)
      .run(strip({ $id: id, $tripId: 't1', $now: now, ...tripItemBindings(schema.parse(input), tz) }));

  const list = () =>
    db.prepare(SELECT_TRIP_ITEMS).all({ tripId: 't1' }) as (TripItemRow & {
      trip_default_tz: string;
    })[];

  const get = (id: string) =>
    db.prepare(SELECT_TRIP_ITEM).get({ id }) as TripItemRow & { trip_default_tz: string };

  return { db, insert, list, get };
}

const duomo = { kind: 'activity', title: 'Duomo', start: { local: '2026-09-19T14:00' } };

describe('INSERT_TRIP_ITEM', () => {
  it('writes every column the statement names, against the real schema', () => {
    const { insert, get } = setup();
    insert('i1', {
      ...duomo,
      subkind: 'attraction',
      status: 'confirmed',
      end: { local: '2026-09-19T15:30' },
      locationName: 'Piazza del Duomo',
      confirmationCode: 'ABC123',
      priceAmount: 2500,
      priceCurrency: 'EUR',
      isPaid: true,
      details: { seat: '12A' },
    });

    const row = get('i1');
    expect(row.title).toBe('Duomo');
    expect(row.start_utc).toBe('2026-09-19T12:00:00.000Z');
    expect(row.end_utc).toBe('2026-09-19T13:30:00.000Z');
    expect(row.is_paid).toBe(1);
    expect(row.details).toBe('{"seat":"12A"}');
    expect(row.created_at).toBe(now);
  });

  it('stores an unqualified zone as NULL so the trip default stays authoritative', () => {
    const { insert, get } = setup();
    insert('i1', duomo);
    expect(get('i1').start_tz).toBeNull();
  });

  it('rejects a kind the schema does not allow', () => {
    const { db } = setup();
    expect(() =>
      db.prepare(INSERT_TRIP_ITEM).run(
        strip({
          $id: 'bad',
          $tripId: 't1',
          $now: now,
          ...tripItemBindings(schema.parse(duomo), ROME),
          $kind: 'place',
        }),
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  it('cascades away with its trip', () => {
    const { db, insert, list } = setup();
    insert('i1', duomo);
    db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();
    expect(list()).toHaveLength(0);
  });
});

describe('SELECT_TRIP_ITEMS', () => {
  it('orders dated items chronologically and leaves undated ones last', () => {
    const { insert, list } = setup();
    insert('dinner', { kind: 'food', title: 'Dinner', start: { local: '2026-09-19T19:30' } });
    insert('bakery', { kind: 'food', title: 'That bakery' });
    insert('flight', {
      kind: 'transport',
      title: 'Flight',
      start: { local: '2026-09-19T06:10' },
    });

    expect(list().map((r) => r.id)).toEqual(['flight', 'dinner', 'bakery']);
  });

  it('sorts a date-only item above a timed one on the same day', () => {
    const { insert, list } = setup();
    insert('timed', duomo);
    insert('dateOnly', { kind: 'activity', title: 'Wander', start: { local: '2026-09-19' } });

    expect(list().map((r) => r.id)).toEqual(['dateOnly', 'timed']);
  });

  it('carries the trip default zone so a row can be parsed on its own', () => {
    const { insert, list } = setup();
    insert('i1', duomo);
    const [row] = list();

    expect(row.trip_default_tz).toBe(ROME);
    expect(parseTripItemRow(row, row.trip_default_tz).start?.tz).toBe(ROME);
  });

  it('does not return items belonging to another trip', () => {
    const { db, insert, list } = setup();
    insert('mine', duomo);
    db.prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('t2', 'Other', '2026-10-01', '2026-10-05', 'Europe/Sofia', ?, ?)`,
    ).run(now, now);
    db.prepare(INSERT_TRIP_ITEM).run(
      strip({ $id: 'theirs', $tripId: 't2', $now: now, ...tripItemBindings(schema.parse(duomo), ROME) }),
    );

    expect(list().map((r) => r.id)).toEqual(['mine']);
  });
});

describe('UPDATE_TRIP_ITEM', () => {
  it('rewrites the wall clock and the instant together', () => {
    const { db, insert, get } = setup();
    insert('i1', duomo);
    db.prepare(UPDATE_TRIP_ITEM).run(
      strip({
        $id: 'i1',
        $now: '2026-09-12T00:00:00.000Z',
        ...tripItemBindings(schema.parse({ ...duomo, start: { local: '2026-09-19T16:00' } }), ROME),
      }),
    );

    const row = get('i1');
    expect(row.start_local).toBe('2026-09-19T16:00');
    expect(row.start_utc).toBe('2026-09-19T14:00:00.000Z');
    expect(row.updated_at).toBe('2026-09-12T00:00:00.000Z');
    expect(row.created_at).toBe(now);
  });

  it('clears the dates when an item stops being scheduled', () => {
    const { db, insert, get } = setup();
    insert('i1', duomo);
    db.prepare(UPDATE_TRIP_ITEM).run(
      strip({
        $id: 'i1',
        $now: now,
        ...tripItemBindings(schema.parse({ kind: 'activity', title: 'Duomo' }), ROME),
      }),
    );

    expect([get('i1').start_local, get('i1').start_utc]).toEqual([null, null]);
  });
});

describe('SET_TASK_COMPLETED', () => {
  it('completes a task and clears it again', () => {
    const { db, insert, get } = setup();
    insert('t', { kind: 'task', title: 'Online check-in' });
    const run = (completedAt: string | null) =>
      db.prepare(SET_TASK_COMPLETED).run({ id: 't', completedAt, now });

    run(now);
    expect(get('t').completed_at).toBe(now);
    run(null);
    expect(get('t').completed_at).toBeNull();
  });

  it('leaves anything that is not a task alone, since only a task can be ticked off', () => {
    const { db, insert, get } = setup();
    insert('i1', duomo);
    const result = db.prepare(SET_TASK_COMPLETED).run({ id: 'i1', completedAt: now, now });

    expect(result.changes).toBe(0);
    expect(get('i1').completed_at).toBeNull();
  });
});

describe('recomputing instants after the trip zone changes', () => {
  const setupMixed = () => {
    const ctx = setup();
    ctx.insert('follows', duomo);
    ctx.insert('pinned', { ...duomo, start: { local: '2026-09-19T14:00', tz: 'Asia/Tokyo' } });
    ctx.insert('undated', { kind: 'food', title: 'That bakery' });
    return ctx;
  };

  it('selects only the rows that lean on the trip default', () => {
    const { db } = setupMixed();
    const rows = db.prepare(SELECT_ITEMS_WITH_DEFAULT_TZ).all({ tripId: 't1' }) as { id: string }[];

    expect(rows.map((r) => r.id)).toEqual(['follows']);
  });

  it('rewrites the instant while leaving the wall clock untouched', () => {
    const { db, get } = setupMixed();
    db.prepare(UPDATE_ITEM_INSTANTS).run({
      id: 'follows',
      startUtc: '2026-09-19T11:00:00.000Z',
      endUtc: null,
      now: '2026-09-12T00:00:00.000Z',
    });

    const row = get('follows');
    expect(row.start_utc).toBe('2026-09-19T11:00:00.000Z');
    expect(row.start_local).toBe('2026-09-19T14:00');
  });
});

describe('SELECT_KNOWN_PLACES', () => {
  it('offers named places from every trip, this one first, cancelled ones left out', () => {
    const { db, insert } = setup();
    db.prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('t0', 'Earlier', '2026-01-01', '2026-01-02', 'Europe/Rome', ?, ?)`,
    ).run(now, now);
    insert('i1', { ...duomo, locationName: 'Piazza del Duomo', address: 'Milano' });
    insert('i2', { ...duomo, locationName: '  ' });
    insert('i3', { ...duomo, status: 'cancelled', locationName: 'Gone' });
    db.prepare(
      `INSERT INTO trip_items (id, trip_id, kind, status, title, location_name, created_at, updated_at)
       VALUES ('old', 't0', 'stay', 'confirmed', 'Hotel', 'Hotel Brera', ?, ?)`,
    ).run(now, now);

    expect(db.prepare(SELECT_KNOWN_PLACES).all({ tripId: 't1' })).toEqual([
      { name: 'Piazza del Duomo', address: 'Milano' },
      { name: 'Hotel Brera', address: null },
    ]);
  });
});
