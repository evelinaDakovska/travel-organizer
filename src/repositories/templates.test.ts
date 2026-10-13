import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import {
  addListItem,
  createList,
  listListItems,
  listTripLists,
  setListItemDone,
} from './lists';
import { createNote, listNotes } from './notes';
import {
  applyTemplate,
  deleteTemplate,
  getTemplate,
  saveTemplate,
  templateUses,
} from './templates';
import { createTripItem, listTripItems, setTaskCompleted } from './tripItems';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

const now = '2026-10-13T09:00:00.000Z';

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  const trip = (id: string, start: string, end: string, tz: string) =>
    raw
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, id, start, end, tz, now, now);
  trip('lapland', '2026-11-20', '2026-11-24', 'Europe/Helsinki');
  trip('vienna', '2027-03-01', '2027-03-04', 'Europe/Vienna');
  return { raw, db: asyncDatabase(raw) };
}

/** Lapland, prepared: two tasks (one ticked, one undated), a note, a part-packed list, a booking. */
async function prepare(db: ReturnType<typeof setup>['db']) {
  const schema = tripItemInputSchema('Europe/Helsinki');
  const checkIn = await createTripItem(
    db,
    'lapland',
    schema.parse({ kind: 'task', status: 'confirmed', title: 'Online check-in', start: { local: '2026-11-19T09:20' } }),
  );
  await setTaskCompleted(db, checkIn, true);
  await createTripItem(db, 'lapland', schema.parse({ kind: 'task', status: 'confirmed', title: 'Buy adapters' }));
  await createTripItem(
    db,
    'lapland',
    schema.parse({ kind: 'stay', status: 'confirmed', title: 'Aurora cabin', confirmationCode: 'AUR-1', priceAmount: 66000, priceCurrency: 'EUR' }),
  );
  await createNote(db, 'lapland', { title: 'Cabin key box', body: 'Code 2468', pinned: true });
  const packing = await createList(db, { tripId: 'lapland', kind: 'packing', name: 'Winter' });
  const socks = await addListItem(db, packing, { label: 'Wool socks', quantity: 3 });
  await setListItemDone(db, socks, true);

  const items = await listTripItems(db, 'lapland');
  return {
    tasks: items.filter((item) => item.kind === 'task'),
    notes: await listNotes(db, 'lapland'),
    lists: await listTripLists(db, 'lapland'),
  };
}

describe('saving a trip as a template', () => {
  it('keeps tasks by their day from the start, notes and lists — never bookings or ticks', async () => {
    const { db } = setup();
    const id = await saveTemplate(db, '2026-11-20', 'Winter trip', await prepare(db));

    const template = await getTemplate(db, id);
    expect(template?.content).toEqual({
      version: 1,
      tasks: [
        { title: 'Online check-in', offsetDays: -1, time: '09:20' },
        { title: 'Buy adapters', offsetDays: null, time: null },
      ],
      notes: [{ title: 'Cabin key box', body: 'Code 2468', pinned: true }],
      lists: [{ kind: 'packing', name: 'Winter', items: [{ label: 'Wool socks', quantity: 3 }] }],
    });
    expect(JSON.stringify(template)).not.toMatch(/AUR-1|Aurora|66000/);
  });
});

describe('applying a template', () => {
  it('moves tasks to the new trip, resets done and ticks, and records the use', async () => {
    const { db } = setup();
    const id = await saveTemplate(db, '2026-11-20', 'Winter trip', await prepare(db));

    await applyTemplate(db, id, 'vienna');

    const items = await listTripItems(db, 'vienna');
    expect(items.map((item) => [item.title, item.start?.local ?? null, item.completedAt])).toEqual([
      ['Online check-in', '2027-02-28T09:20', null],
      ['Buy adapters', null, null],
    ]);
    // In the new trip's zone, not the old one's.
    expect(items[0].start?.tz).toBe('Europe/Vienna');
    expect((await listNotes(db, 'vienna')).map((note) => note.title)).toEqual(['Cabin key box']);
    const [list] = await listTripLists(db, 'vienna');
    expect(list).toMatchObject({ name: 'Winter', done: 0, total: 1 });
    expect((await listListItems(db, list.id))[0]).toMatchObject({ label: 'Wool socks', doneAt: null });
    expect(await templateUses(db, 'vienna', id)).toHaveLength(1);
  });

  it('copies with new identities: the template, and trips, stay apart', async () => {
    const { db } = setup();
    const id = await saveTemplate(db, '2026-11-20', 'Winter trip', await prepare(db));
    await applyTemplate(db, id, 'vienna');

    await deleteTemplate(db, id);
    expect(await listTripItems(db, 'vienna')).toHaveLength(2);
    // The source trip is untouched by any of it.
    expect((await listTripItems(db, 'lapland')).map((item) => item.title)).toContain('Aurora cabin');
  });

  it('adds again when applied again — the screen asks first, the use is recorded', async () => {
    const { db } = setup();
    const id = await saveTemplate(db, '2026-11-20', 'Winter trip', await prepare(db));
    await applyTemplate(db, id, 'vienna');
    await applyTemplate(db, id, 'vienna');
    expect(await listTripItems(db, 'vienna')).toHaveLength(4);
    expect(await templateUses(db, 'vienna', id)).toHaveLength(2);
  });

  it('refuses a template it cannot read, writing nothing', async () => {
    const { raw, db } = setup();
    raw
      .prepare(
        `INSERT INTO templates (id, name, content, created_at, updated_at)
         VALUES ('later', 'From a later version', '{"version":2}', ?, ?)`,
      )
      .run(now, now);
    await expect(applyTemplate(db, 'later', 'vienna')).rejects.toThrow('cannot be read');
    expect(await listTripItems(db, 'vienna')).toEqual([]);
  });
});
