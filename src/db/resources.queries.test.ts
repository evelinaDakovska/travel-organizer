import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations';
import {
  INSERT_RESOURCE,
  SELECT_ALL_STORED_PATHS,
  SELECT_RESOURCE,
  SELECT_RESOURCES_FOR_ITEM,
  SELECT_RESOURCES_FOR_TRIP,
  SELECT_TRIP_STORED_PATHS,
  UPDATE_RESOURCE_LABEL,
} from './queries';
import { orphanedStoredPaths, parseResourceRow, type ResourceRow } from '../domain/resource';

const now = '2026-09-11T00:00:00.000Z';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) db.exec(m.sql);

  const trip = (id: string) =>
    db
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES (?, ?, '2026-09-19', '2026-09-22', 'Europe/Rome', ?, ?)`,
      )
      .run(id, id, now, now);

  const item = (id: string, tripId: string) =>
    db
      .prepare(
        `INSERT INTO trip_items (id, trip_id, kind, status, title, created_at, updated_at)
         VALUES (?, ?, 'activity', 'confirmed', ?, ?, ?)`,
      )
      .run(id, tripId, id, now, now);

  const add = (params: Partial<Record<string, unknown>> & { id: string }) =>
    db.prepare(INSERT_RESOURCE).run({
      tripId: null,
      tripItemId: null,
      kind: 'file',
      subtype: 'ticket',
      label: params.id,
      url: null,
      storedPath: `media/${params.id}.pdf`,
      fileName: null,
      mimeType: 'application/pdf',
      sizeBytes: null,
      now,
      ...params,
    });

  const forItem = (id: string) =>
    db.prepare(SELECT_RESOURCES_FOR_ITEM).all({ id }) as ResourceRow[];
  const forTrip = (id: string) =>
    db.prepare(SELECT_RESOURCES_FOR_TRIP).all({ id }) as ResourceRow[];

  trip('t1');
  item('i1', 't1');
  return { db, trip, item, add, forItem, forTrip };
}

describe('INSERT_RESOURCE', () => {
  it('attaches a file to an item', () => {
    const { add, forItem } = setup();
    add({ id: 'r1', tripItemId: 'i1' });

    const [row] = forItem('i1');
    expect(parseResourceRow(row)).toMatchObject({
      kind: 'file',
      storedPath: 'media/r1.pdf',
      owner: { scope: 'item', id: 'i1' },
    });
  });

  it('attaches a link to a trip', () => {
    const { add, forTrip } = setup();
    add({
      id: 'r1',
      tripId: 't1',
      kind: 'link',
      subtype: 'wallet',
      url: 'https://wallet.example',
      storedPath: null,
    });

    expect(parseResourceRow(forTrip('t1')[0])).toMatchObject({
      kind: 'link',
      url: 'https://wallet.example',
      owner: { scope: 'trip', id: 't1' },
    });
  });

  it('refuses a resource owned by both a trip and an item', () => {
    const { add } = setup();
    expect(() => add({ id: 'bad', tripId: 't1', tripItemId: 'i1' })).toThrow(
      /CHECK constraint failed/,
    );
  });

  it('refuses a resource owned by neither', () => {
    const { add } = setup();
    expect(() => add({ id: 'bad' })).toThrow(/CHECK constraint failed/);
  });

  it('refuses a file with no path and a link with no url', () => {
    const { add } = setup();
    expect(() => add({ id: 'bad', tripItemId: 'i1', storedPath: null })).toThrow(
      /CHECK constraint failed/,
    );
    expect(() =>
      add({ id: 'bad2', tripItemId: 'i1', kind: 'link', storedPath: null, url: null }),
    ).toThrow(/CHECK constraint failed/);
  });

  it('numbers each owner sort order from zero, independently', () => {
    const { add, forItem, forTrip } = setup();
    add({ id: 'a', tripItemId: 'i1' });
    add({ id: 'b', tripItemId: 'i1' });
    add({ id: 'c', tripId: 't1' });

    expect(forItem('i1').map((r) => [r.id, r.sort_order])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(forTrip('t1').map((r) => [r.id, r.sort_order])).toEqual([['c', 0]]);
  });

  it('cascades away with the item it hangs off', () => {
    const { db, add, forItem } = setup();
    add({ id: 'r1', tripItemId: 'i1' });
    db.prepare(`DELETE FROM trip_items WHERE id = 'i1'`).run();

    expect(forItem('i1')).toHaveLength(0);
  });

  it('cascades away when the whole trip goes, including through its items', () => {
    const { db, add } = setup();
    add({ id: 'onItem', tripItemId: 'i1' });
    add({ id: 'onTrip', tripId: 't1' });
    db.prepare(`DELETE FROM trips WHERE id = 't1'`).run();

    expect(db.prepare(`SELECT COUNT(*) AS n FROM resources`).get()).toEqual({ n: 0 });
  });
});

describe('UPDATE_RESOURCE_LABEL', () => {
  it('renames without touching the file it points at', () => {
    const { db, add, forItem } = setup();
    add({ id: 'r1', tripItemId: 'i1' });
    db.prepare(UPDATE_RESOURCE_LABEL).run({ id: 'r1', label: 'Return leg', subtype: 'ticket' });

    const [row] = forItem('i1');
    expect([row.label, row.stored_path]).toEqual(['Return leg', 'media/r1.pdf']);
  });
});

describe('SELECT_RESOURCE', () => {
  it('finds one attachment by id, and nothing once it is gone', () => {
    const { db, add } = setup();
    add({ id: 'r1', tripItemId: 'i1' });

    const row = db.prepare(SELECT_RESOURCE).get({ id: 'r1' }) as ResourceRow;
    expect(parseResourceRow(row)).toMatchObject({ id: 'r1', storedPath: 'media/r1.pdf' });

    db.prepare(`DELETE FROM resources WHERE id = 'r1'`).run();
    expect(db.prepare(SELECT_RESOURCE).get({ id: 'r1' })).toBeUndefined();
  });
});

describe('the paths the sweep keeps', () => {
  const seeded = () => {
    const ctx = setup();
    ctx.trip('t2');
    ctx.item('i2', 't2');
    ctx.add({ id: 'onItem1', tripItemId: 'i1' });
    ctx.add({ id: 'onTrip1', tripId: 't1' });
    ctx.add({ id: 'onItem2', tripItemId: 'i2' });
    ctx.add({ id: 'aLink', tripId: 't1', kind: 'link', url: 'https://x', storedPath: null });
    return ctx;
  };

  const paths = (db: Database.Database, sql: string, params?: object) =>
    (db.prepare(sql).all(params ?? {}) as { stored_path: string }[]).map((r) => r.stored_path);

  it('lists every referenced file across both owner kinds, and no links', () => {
    const { db } = seeded();
    expect(paths(db, SELECT_ALL_STORED_PATHS).sort()).toEqual([
      'media/onItem1.pdf',
      'media/onItem2.pdf',
      'media/onTrip1.pdf',
    ]);
  });

  it('scopes to one trip, reaching through its items', () => {
    const { db } = seeded();
    expect(paths(db, SELECT_TRIP_STORED_PATHS, { tripId: 't1' }).sort()).toEqual([
      'media/onItem1.pdf',
      'media/onTrip1.pdf',
    ]);
  });

  it('spares every referenced file and deletes the stray one', () => {
    const { db } = seeded();
    const onDisk = [...paths(db, SELECT_ALL_STORED_PATHS), 'media/stray.pdf'];

    expect(orphanedStoredPaths(onDisk, paths(db, SELECT_ALL_STORED_PATHS))).toEqual([
      'media/stray.pdf',
    ]);
  });

  it('frees a file for collection as soon as its row is deleted', () => {
    const { db } = seeded();
    const before = paths(db, SELECT_ALL_STORED_PATHS);
    db.prepare(`DELETE FROM resources WHERE id = 'onItem1'`).run();

    expect(orphanedStoredPaths(before, paths(db, SELECT_ALL_STORED_PATHS))).toEqual([
      'media/onItem1.pdf',
    ]);
  });
});
