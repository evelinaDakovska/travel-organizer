import Database from 'better-sqlite3';

import { asyncDatabase } from '../db/testing/asyncDatabase';
import { MIGRATIONS } from '../db/migrations';
import type { ResourceInput } from '../domain/resource';
import { tripItemInputSchema } from '../domain/tripItem';
import { saveSharedRows } from './share';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

const now = '2026-11-02T12:00:00.000Z';

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  raw
    .prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('t1', 'Lapland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
    )
    .run(now, now);
  const count = (table: string) =>
    (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { raw, db: asyncDatabase(raw), count };
}

const file = (name: string): ResourceInput => ({
  kind: 'file',
  subtype: 'generic',
  label: name,
  storedPath: `media/${name}.pdf`,
  fileName: `${name}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 100,
});
/** A row the database refuses: a file with nowhere it is stored. */
const broken = { ...file('broken'), storedPath: null } as unknown as ResourceInput;

const newItem = tripItemInputSchema('Europe/Helsinki').parse({
  kind: 'other',
  status: 'confirmed',
  title: 'Boarding passes',
});

describe('saveSharedRows', () => {
  it('creates the new item and every file row together', async () => {
    const { db, count } = setup();
    const owner = await saveSharedRows(db, { to: 'new-item', tripId: 't1', input: newItem }, [
      file('a'),
      file('b'),
    ]);
    expect(owner.scope).toBe('item');
    expect(count('trip_items')).toBe(1);
    expect(count('resources')).toBe(2);
  });

  it('writes nothing — not even the item — when one row fails', async () => {
    const { db, count } = setup();
    await expect(
      saveSharedRows(db, { to: 'new-item', tripId: 't1', input: newItem }, [file('a'), broken]),
    ).rejects.toThrow(/NOT NULL|CHECK/);
    expect(count('trip_items')).toBe(0);
    expect(count('resources')).toBe(0);
  });

  it('adds to an existing owner, all or none', async () => {
    const { db, count } = setup();
    const trip = { scope: 'trip', id: 't1' } as const;
    await saveSharedRows(db, { to: 'existing', owner: trip }, [file('a')]);
    await expect(
      saveSharedRows(db, { to: 'existing', owner: trip }, [file('b'), broken]),
    ).rejects.toThrow(/NOT NULL|CHECK/);
    expect(count('resources')).toBe(1);
  });

  it('fails cleanly for an item deleted meanwhile', async () => {
    const { db, count } = setup();
    await expect(
      saveSharedRows(db, { to: 'existing', owner: { scope: 'item', id: 'gone' } }, [file('a')]),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect(count('resources')).toBe(0);
  });
});
