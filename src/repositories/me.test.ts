import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import {
  addTravellerToTrips,
  createMe,
  createTraveller,
  deleteTraveller,
  getMe,
  listItemParticipants,
  listTripsWithout,
  listTripTravellers,
  renameTraveller,
  setMe,
} from './travellers';
import { createTripItem } from './tripItems';
import { createTripWithMembers } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * "Me" (2B-0): one traveller profile marked as the person using the app. Choosing it, or adding
 * it to existing trips, changes membership only — never who goes to a booking, never money.
 */

const now = '2026-10-19T09:00:00.000Z';

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  const trip = raw.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Europe/Helsinki', ?, ?)`,
  );
  trip.run('lapland', 'Lapland', '2026-11-20', '2026-11-24', now, now);
  trip.run('milan', 'Milan', '2026-09-19', '2026-09-22', now, now);
  return { raw, db: asyncDatabase(raw) };
}

const dump = (raw: Database.Database, table: string) =>
  raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();

describe('Me', () => {
  it('is nobody until chosen', async () => {
    const { db } = setup();
    expect(await getMe(db)).toBeNull();
  });

  it('can be an existing profile, renamed later and still Me', async () => {
    const { db } = setup();
    const evelina = await createTraveller(db, 'Evelina', 'adult');
    await setMe(db, evelina);
    await renameTraveller(db, evelina, 'Evi');
    expect(await getMe(db)).toMatchObject({ id: evelina, name: 'Evi', classification: 'adult' });
  });

  it('can be a new profile, an adult unless said otherwise', async () => {
    const { db } = setup();
    const id = await createMe(db, 'Evelina');
    expect(await getMe(db)).toMatchObject({ id, name: 'Evelina', classification: 'adult' });
  });

  it('is only ever one profile: choosing another moves it', async () => {
    const { raw, db } = setup();
    const a = await createMe(db, 'Evelina');
    const b = await createTraveller(db, 'Evelina Dakovska', 'adult');
    await setMe(db, b);
    expect((await getMe(db))?.id).toBe(b);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM settings WHERE key = 'me_traveller_id'`).get()).toEqual({
      n: 1,
    });
    expect((await getMe(db))?.id).not.toBe(a);
  });

  it('refuses a profile that does not exist, and reads as nobody if its profile is gone', async () => {
    const { raw, db } = setup();
    await expect(setMe(db, 'nobody')).rejects.toThrow();
    raw.prepare(`INSERT INTO settings (key, value) VALUES ('me_traveller_id', 'gone')`).run();
    expect(await getMe(db)).toBeNull();
  });

  it('is not deleted by accident', async () => {
    const { db } = setup();
    const me = await createMe(db, 'Evelina');
    expect(await deleteTraveller(db, me)).toMatchObject({ deleted: false, isMe: true });
    expect((await getMe(db))?.id).toBe(me);
  });
});

describe('adding Me to existing trips', () => {
  it('offers only the trips Me is not on, and adds Me to the chosen ones once', async () => {
    const { db } = setup();
    const misho = await createTraveller(db, 'Misho', 'adult');
    const me = await createMe(db, 'Evelina');
    await addTravellerToTrips(db, me, ['milan']);

    expect((await listTripsWithout(db, me)).map((trip) => trip.id)).toEqual(['lapland']);

    await addTravellerToTrips(db, misho, ['lapland']);
    await addTravellerToTrips(db, me, ['lapland', 'lapland', 'milan']);
    expect((await listTripTravellers(db, 'lapland')).map((t) => t.name)).toEqual([
      'Misho',
      'Evelina',
    ]);
    expect(await listTripsWithout(db, me)).toEqual([]);
  });

  it('leaves who goes to each booking, and every price and expense, exactly as it was', async () => {
    const { raw, db } = setup();
    const misho = await createTraveller(db, 'Misho', 'adult');
    await addTravellerToTrips(db, misho, ['lapland']);
    const tour = await createTripItem(
      db,
      'lapland',
      tripItemInputSchema('Europe/Helsinki').parse({
        kind: 'activity',
        status: 'confirmed',
        title: 'Husky safari',
        priceAmount: 29000,
        priceCurrency: 'EUR',
      }),
      [misho],
    );
    raw
      .prepare(
        `INSERT INTO expenses (id, trip_id, category, amount, currency, spent_on, created_at,
                               updated_at)
         VALUES ('e1', 'lapland', 'food', 1250, 'EUR', '2026-11-21', ?, ?)`,
      )
      .run(now, now);
    const before = ['trip_items', 'item_participants', 'expenses', 'payments', 'list_items'].map(
      (table) => dump(raw, table),
    );

    const me = await createMe(db, 'Evelina');
    await addTravellerToTrips(db, me, ['lapland']);

    expect(
      ['trip_items', 'item_participants', 'expenses', 'payments', 'list_items'].map((table) =>
        dump(raw, table),
      ),
    ).toEqual(before);
    expect(await listItemParticipants(db, tour)).toEqual([expect.objectContaining({ id: misho })]);
  });

  it('is part of a new trip when the trip is created with Me chosen', async () => {
    const { db } = setup();
    const me = await createMe(db, 'Evelina');
    const id = await createTripWithMembers(
      db,
      {
        name: 'Rome',
        startDate: '2027-03-01',
        endDate: '2027-03-04',
        defaultTz: 'Europe/Rome',
      },
      [me],
    );
    expect((await listTripTravellers(db, id)).map((t) => t.id)).toEqual([me]);
  });
});
