import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import { importActivities } from './activityImport';
import { setSetting } from './settings';
import { saveSharedRows } from './share';
import {
  addTravellerToItems,
  addTripTraveller,
  createTraveller,
  createTripTraveller,
  listItemParticipants,
  listJoinCandidates,
  removeTripTraveller,
} from './travellers';
import { createTripItem, updateTripItem } from './tripItems';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

const now = '2026-10-13T09:00:00.000Z';
const schema = tripItemInputSchema('Europe/Helsinki');
const plan = (title: string, extra: Record<string, unknown> = {}) =>
  schema.parse({ kind: 'activity', status: 'confirmed', title, ...extra });

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  for (const id of ['lapland', 'milan', 'empty']) {
    raw
      .prepare(
        `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
         VALUES (?, ?, '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
      )
      .run(id, id, now, now);
  }
  return { raw, db: asyncDatabase(raw) };
}

/** Every row of a table, in a fixed order — to show what an action did and did not touch. */
function rows(raw: Database.Database, table: string) {
  return raw.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all();
}

const names = (travellers: { name: string }[]) => travellers.map((traveller) => traveller.name);
const titles = (items: { title: string }[]) => items.map((entry) => entry.title);
const before = new Date('2026-11-01T00:00:00Z');

/** A trip as the owner has it: two adults and a child, a mix of plans, places, a to-do. */
async function lapland(db: ReturnType<typeof setup>['db']) {
  const ev = await createTripTraveller(db, 'lapland', 'Evelina', 'adult');
  const ana = await createTripTraveller(db, 'lapland', 'Ana', 'adult');
  const husky = await createTripItem(
    db,
    'lapland',
    plan('Husky safari', {
      start: { local: '2026-11-21T13:00' },
      priceAmount: 29000,
      priceCurrency: 'EUR',
      isPaid: true,
    }),
    [ev, ana],
  );
  const aurora = await createTripItem(
    db,
    'lapland',
    plan('Aurora tour', { start: { local: '2026-11-22T21:00' }, priceAmount: 9000, priceCurrency: 'EUR' }),
    [ev],
  );
  const sauna = await createTripItem(db, 'lapland', plan('Sauna'), []);
  const arktikum = await createTripItem(
    db,
    'lapland',
    schema.parse({ kind: 'activity', status: 'idea', title: 'Arktikum' }),
    [],
  );
  const task = await createTripItem(
    db,
    'lapland',
    schema.parse({ kind: 'task', status: 'confirmed', title: 'Print tickets' }),
    [],
  );
  const cancelled = await createTripItem(
    db,
    'lapland',
    schema.parse({ kind: 'activity', status: 'cancelled', title: 'Snowmobile' }),
    [],
  );
  return { ev, ana, husky, aurora, sauna, arktikum, task, cancelled };
}

describe('what someone joining a trip is offered', () => {
  it('offers the trip’s plans and saved places they are not on, never to-dos or cancelled', async () => {
    const { db } = setup();
    const trip = await lapland(db);
    const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');

    const offered = await listJoinCandidates(db, 'lapland', mia, before);
    expect(titles(offered.plans)).toEqual(['Husky safari', 'Aurora tour', 'Sauna']);
    expect(titles(offered.places)).toEqual(['Arktikum']);

    // Someone already on some of them is offered only the rest.
    const forAna = await listJoinCandidates(db, 'lapland', trip.ana, before);
    expect(titles(forAna.plans)).toEqual(['Aurora tour', 'Sauna']);
  });

  it('offers nothing from another trip, and nothing on an empty trip', async () => {
    const { db } = setup();
    await lapland(db);
    const ev = await createTraveller(db, 'Evelina');
    await addTripTraveller(db, 'empty', ev);
    expect(await listJoinCandidates(db, 'empty', ev, before)).toEqual({ plans: [], places: [] });
  });

  it('reads only: listing changes nothing', async () => {
    const { raw, db } = setup();
    await lapland(db);
    const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
    const snapshot = ['trip_items', 'item_participants', 'trip_travellers', 'travellers'].map(
      (table) => rows(raw, table),
    );
    await listJoinCandidates(db, 'lapland', mia, before);
    expect(
      ['trip_items', 'item_participants', 'trip_travellers', 'travellers'].map((table) =>
        rows(raw, table),
      ),
    ).toEqual(snapshot);
  });
});

describe('adding someone who joined to existing items', () => {
  it('joining a trip adds them to nothing by itself', async () => {
    const { raw, db } = setup();
    await lapland(db);
    const participation = rows(raw, 'item_participants');
    await createTripTraveller(db, 'lapland', 'Mia', 'child');
    const ola = await createTraveller(db, 'Ola');
    await addTripTraveller(db, 'lapland', ola);
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });

  it('adds them to exactly the items ticked, and changes nothing else', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
    const items = rows(raw, 'trip_items');
    const members = rows(raw, 'trip_travellers');
    const profiles = rows(raw, 'travellers');
    const participation = rows(raw, 'item_participants');

    expect(await addTravellerToItems(db, 'lapland', mia, [trip.husky, trip.arktikum])).toBe(2);

    expect(names(await listItemParticipants(db, trip.husky))).toEqual(['Evelina', 'Ana', 'Mia']);
    expect(names(await listItemParticipants(db, trip.arktikum))).toEqual(['Mia']);
    expect(names(await listItemParticipants(db, trip.aurora))).toEqual(['Evelina']);
    expect(await listItemParticipants(db, trip.sauna)).toEqual([]);
    // Only two rows more; every item — price, paid, times, updated_at — byte for byte the same.
    expect(rows(raw, 'item_participants')).toEqual(
      expect.arrayContaining(participation as object[]),
    );
    expect(rows(raw, 'item_participants')).toHaveLength(participation.length + 2);
    expect(rows(raw, 'trip_items')).toEqual(items);
    expect(rows(raw, 'trip_travellers')).toEqual(members);
    expect(rows(raw, 'travellers')).toEqual(profiles);
  });

  it('ticking nothing adds nothing', async () => {
    const { raw, db } = setup();
    await lapland(db);
    const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
    const participation = rows(raw, 'item_participants');
    expect(await addTravellerToItems(db, 'lapland', mia, [])).toBe(0);
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });

  it('ignores a to-do, a cancelled plan, another trip’s item, or one they are on already', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    await addTripTraveller(db, 'milan', trip.ev);
    const duomo = await createTripItem(db, 'milan', plan('Duomo'), []);
    const participation = rows(raw, 'item_participants');

    expect(
      await addTravellerToItems(db, 'lapland', trip.ev, [
        trip.task,
        trip.cancelled,
        duomo,
        trip.husky,
        trip.husky,
        'no-such-item',
      ]),
    ).toBe(0);
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });

  it('refuses someone who is not on the trip, and writes nothing', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    const stranger = await createTraveller(db, 'Stranger');
    const participation = rows(raw, 'item_participants');
    await expect(addTravellerToItems(db, 'lapland', stranger, [trip.sauna])).rejects.toThrow(
      /not on this trip/,
    );
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });

  it('is all or none: a failure part-way leaves no participation added', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
    const participation = rows(raw, 'item_participants');
    raw.exec(`CREATE TEMP TRIGGER fail_on_sauna BEFORE INSERT ON item_participants
              WHEN NEW.item_id = '${trip.sauna}' BEGIN SELECT RAISE(ABORT, 'injected'); END`);
    await expect(
      addTravellerToItems(db, 'lapland', mia, [trip.husky, trip.aurora, trip.sauna]),
    ).rejects.toThrow(/injected/);
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });

  it('tells two people of the same name apart: only the one chosen is added', async () => {
    const { db } = setup();
    const trip = await lapland(db);
    const mariaA = await createTripTraveller(db, 'lapland', 'Maria', 'adult');
    const mariaB = await createTripTraveller(db, 'lapland', 'Maria', 'child');
    await addTravellerToItems(db, 'lapland', mariaB, [trip.sauna]);
    const onSauna = await listItemParticipants(db, trip.sauna);
    expect(onSauna.map((person) => person.id)).toEqual([mariaB]);
    expect(titles((await listJoinCandidates(db, 'lapland', mariaA, before)).plans)).toContain(
      'Sauna',
    );
  });

  it('the same profile on two trips: adding on one trip leaves the other alone', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    const ola = await createTraveller(db, 'Ola', 'adult');
    await addTripTraveller(db, 'milan', ola);
    const duomo = await createTripItem(db, 'milan', plan('Duomo'), []);
    await addTripTraveller(db, 'lapland', ola);

    await addTravellerToItems(db, 'lapland', ola, [trip.sauna]);
    expect(names(await listItemParticipants(db, trip.sauna))).toEqual(['Ola']);
    expect(await listItemParticipants(db, duomo)).toEqual([]);
    expect(
      raw.prepare(`SELECT COUNT(*) AS n FROM trip_travellers WHERE traveller_id = ?`).get(ola),
    ).toEqual({ n: 2 });
  });

  it('removing and re-adding: their participation goes, and is offered again, never restored', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    await removeTripTraveller(db, 'lapland', trip.ana);
    expect(names(await listItemParticipants(db, trip.husky))).toEqual(['Evelina']);

    const participation = rows(raw, 'item_participants');
    await addTripTraveller(db, 'lapland', trip.ana);
    // Back on the trip, on nothing until ticked.
    expect(rows(raw, 'item_participants')).toEqual(participation);
    const offered = await listJoinCandidates(db, 'lapland', trip.ana, before);
    expect(titles(offered.plans)).toEqual(['Husky safari', 'Aurora tour', 'Sauna']);

    await addTravellerToItems(db, 'lapland', trip.ana, [trip.husky]);
    expect(names(await listItemParticipants(db, trip.husky))).toEqual(['Evelina', 'Ana']);
  });

  it('leaves Me exactly as it was', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    await setSetting(db, 'me_traveller_id', trip.ev);
    const settings = rows(raw, 'settings');
    const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
    await addTravellerToItems(db, 'lapland', mia, [trip.husky]);
    await addTravellerToItems(db, 'lapland', trip.ev, [trip.sauna]);
    expect(rows(raw, 'settings')).toEqual(settings);
  });
});

describe('an edit keeps who is going', () => {
  it('an edit that passes the saved set keeps it exactly, and a later joiner is not added', async () => {
    const { raw, db } = setup();
    const trip = await lapland(db);
    await createTripTraveller(db, 'lapland', 'Mia', 'child');
    const saved = (await listItemParticipants(db, trip.husky)).map((person) => person.id);

    await updateTripItem(
      db,
      trip.husky,
      plan('Husky safari (3 h)', {
        start: { local: '2026-11-21T13:00' },
        priceAmount: 29000,
        priceCurrency: 'EUR',
        isPaid: true,
      }),
      saved,
    );
    expect(names(await listItemParticipants(db, trip.husky))).toEqual(['Evelina', 'Ana']);
    const husky = raw
      .prepare(`SELECT price_amount, is_paid FROM trip_items WHERE id = ?`)
      .get(trip.husky);
    expect(husky).toEqual({ price_amount: 29000, is_paid: 1 });
  });
});

describe('items not made in the item form keep nobody going (3B leaves them as they were)', () => {
  it('AI-imported activities (2C) get no participants on a trip with travellers', async () => {
    const { raw, db } = setup();
    await lapland(db);
    const participation = rows(raw, 'item_participants');
    const ids = await importActivities(db, 'lapland', [
      { input: plan('Imported tour'), links: [] },
      { input: schema.parse({ kind: 'food', status: 'idea', title: 'Imported cafe' }), links: [] },
    ]);
    expect(ids).toHaveLength(2);
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });

  it('an item made from something shared in gets no participants', async () => {
    const { raw, db } = setup();
    await lapland(db);
    const participation = rows(raw, 'item_participants');
    await saveSharedRows(db, { to: 'new-item', tripId: 'lapland', input: plan('Shared') }, []);
    expect(rows(raw, 'item_participants')).toEqual(participation);
  });
});
