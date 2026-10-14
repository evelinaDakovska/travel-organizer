import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import {
  addTripTraveller,
  createTraveller,
  createTripTraveller,
  deleteTraveller,
  listItemParticipants,
  listTravellers,
  listTripTravellers,
  removeTripTraveller,
  renameTraveller,
  updateTravellerClassification,
  updateTripTravellerClassification,
} from './travellers';
import { createTripItem, createTripItems, updateTripItem } from './tripItems';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

const now = '2026-10-13T09:00:00.000Z';
const input = (title: string) =>
  tripItemInputSchema('Europe/Helsinki').parse({ kind: 'activity', status: 'confirmed', title });

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  for (const id of ['lapland', 'milan']) {
    raw
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES (?, ?, '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
      )
      .run(id, id, now, now);
  }
  return { raw, db: asyncDatabase(raw) };
}

const names = (travellers: { name: string }[]) => travellers.map((traveller) => traveller.name);

describe('traveller profiles', () => {
  it('lists profiles in the order they were added, and renames in place', async () => {
    const { db } = setup();
    const ev = await createTraveller(db, 'Evelina');
    await createTraveller(db, 'Ana');
    await renameTraveller(db, ev, 'Evelina D.');
    expect(names(await listTravellers(db))).toEqual(['Evelina D.', 'Ana']);
  });

  it('refuses to delete a profile a trip or an item uses, and says where', async () => {
    const { db } = setup();
    const ev = await createTripTraveller(db, 'lapland', 'Evelina');
    expect(await deleteTraveller(db, ev)).toEqual({
      deleted: false,
      uses: { trips: ['lapland'], items: 0 },
    });

    await removeTripTraveller(db, 'lapland', ev);
    expect(await deleteTraveller(db, ev)).toEqual({ deleted: true });
    expect(await listTravellers(db)).toEqual([]);
  });

  it('updates profile default classification', async () => {
    const { db } = setup();
    const id = await createTraveller(db, 'Evelina');
    expect((await listTravellers(db))[0].classification).toBe('unspecified');

    await updateTravellerClassification(db, id, 'adult');
    expect((await listTravellers(db))[0].classification).toBe('adult');
  });
});

describe('a trip’s travellers', () => {
  it('keeps the order they were chosen, and adding twice is harmless', async () => {
    const { db } = setup();
    const ana = await createTraveller(db, 'Ana', 'child');
    const ev = await createTraveller(db, 'Evelina', 'adult');
    await addTripTraveller(db, 'lapland', ev);
    await addTripTraveller(db, 'lapland', ana);
    await addTripTraveller(db, 'lapland', ev);
    expect(names(await listTripTravellers(db, 'lapland'))).toEqual(['Evelina', 'Ana']);
    expect(await listTripTravellers(db, 'lapland')).toEqual([
      expect.objectContaining({ name: 'Evelina', classification: 'adult' }),
      expect.objectContaining({ name: 'Ana', classification: 'child' }),
    ]);
    expect(await listTripTravellers(db, 'milan')).toEqual([]);
  });

  it('overriding classification for one trip does not affect profile default or another trip', async () => {
    const { db } = setup();
    const ev = await createTraveller(db, 'Evelina', 'adult');
    await addTripTraveller(db, 'lapland', ev);
    await addTripTraveller(db, 'milan', ev);

    await updateTripTravellerClassification(db, 'lapland', ev, 'child');

    const laplandMembers = await listTripTravellers(db, 'lapland');
    const milanMembers = await listTripTravellers(db, 'milan');
    const profiles = await listTravellers(db);

    expect(laplandMembers[0].classification).toBe('child');
    expect(milanMembers[0].classification).toBe('adult');
    expect(profiles[0].classification).toBe('adult');
  });

  it('taking someone off a trip takes them off its items, not off another trip’s', async () => {
    const { db } = setup();
    const ev = await createTraveller(db, 'Evelina');
    await addTripTraveller(db, 'lapland', ev);
    await addTripTraveller(db, 'milan', ev);
    const husky = await createTripItem(db, 'lapland', input('Husky safari'), [ev]);
    const duomo = await createTripItem(db, 'milan', input('Duomo'), [ev]);

    await removeTripTraveller(db, 'lapland', ev);

    expect(await listItemParticipants(db, husky)).toEqual([]);
    expect(names(await listItemParticipants(db, duomo))).toEqual(['Evelina']);
    expect(names(await listTripTravellers(db, 'milan'))).toEqual(['Evelina']);
  });
});

describe('items with participants', () => {
  it('saves an item and who takes part together', async () => {
    const { db } = setup();
    const ev = await createTripTraveller(db, 'lapland', 'Evelina');
    const ana = await createTripTraveller(db, 'lapland', 'Ana');
    const id = await createTripItem(db, 'lapland', input('Husky safari'), [ana, ev]);
    // In the trip's order, not the order ticked.
    expect(names(await listItemParticipants(db, id))).toEqual(['Evelina', 'Ana']);
  });

  it('writes neither when a participant does not exist', async () => {
    const { raw, db } = setup();
    await expect(createTripItem(db, 'lapland', input('Ghost tour'), ['nobody'])).rejects.toThrow(
      /FOREIGN KEY/,
    );
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trip_items`).get()).toEqual({ n: 0 });
  });

  it('gives every leg of a journey the same participants', async () => {
    const { db } = setup();
    const ev = await createTripTraveller(db, 'lapland', 'Evelina');
    const ids = await createTripItems(db, 'lapland', [input('Leg 1'), input('Leg 2')], [ev]);
    for (const id of ids) expect(names(await listItemParticipants(db, id))).toEqual(['Evelina']);
  });

  it('replaces participants on an edit when given, and leaves them when not', async () => {
    const { db } = setup();
    const ev = await createTripTraveller(db, 'lapland', 'Evelina');
    const ana = await createTripTraveller(db, 'lapland', 'Ana');
    const id = await createTripItem(db, 'lapland', input('Sauna'), [ev]);

    await updateTripItem(db, id, input('Sauna, renamed'));
    expect(names(await listItemParticipants(db, id))).toEqual(['Evelina']);

    await updateTripItem(db, id, input('Sauna, renamed'), [ana]);
    expect(names(await listItemParticipants(db, id))).toEqual(['Ana']);

    await updateTripItem(db, id, input('Sauna, renamed'), []);
    expect(await listItemParticipants(db, id)).toEqual([]);
  });
});
