import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import {
  addTripTraveller,
  convertLegacyTraveller,
  createTraveller,
  createTripTraveller,
  deleteTraveller,
  listItemParticipants,
  listTravellers,
  listTripTravellers,
  markLegacyTravellerConverted,
  removeTripTraveller,
  renameTraveller,
  updateTravellerClassification,
  updateTripTravellerClassification,
} from './travellers';
import { getTrip } from './trips';
import { legacyNames } from '../domain/traveller';
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

describe('legacy conversion lifecycle', () => {
  it('records converted legacy names and ensures they never reappear even if profile removed', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Alice', 'Bob']));

    const tripBefore = await getTrip(db, 'lapland');
    expect(tripBefore?.convertedTravellers).toEqual([]);

    // Convert Alice to a profile
    const aliceId = await createTripTraveller(db, 'lapland', 'Alice');
    await markLegacyTravellerConverted(db, 'lapland', 'Alice');

    const tripAfter = await getTrip(db, 'lapland');
    expect(tripAfter?.convertedTravellers).toEqual(['Alice']);

    // Check legacyNames: only Bob remains
    const members = await listTripTravellers(db, 'lapland');
    const profiles = await listTravellers(db);
    const unres = legacyNames(
      tripAfter?.travellers ?? [],
      members,
      profiles,
      tripAfter?.convertedTravellers ?? [],
    );
    expect(unres.map((u) => u.name)).toEqual(['Bob']);

    // Now remove Alice from the trip
    await removeTripTraveller(db, 'lapland', aliceId);

    // Alice must NOT reappear in legacyNames even though she is no longer a member!
    const membersAfterRemove = await listTripTravellers(db, 'lapland');
    const unresAfterRemove = legacyNames(
      tripAfter?.travellers ?? [],
      membersAfterRemove,
      profiles,
      tripAfter?.convertedTravellers ?? [],
    );
    expect(unresAfterRemove.map((u) => u.name)).toEqual(['Bob']);

    // Converting Bob case-insensitively appends without duplication
    await markLegacyTravellerConverted(db, 'lapland', 'bob');
    await markLegacyTravellerConverted(db, 'lapland', 'Bob');
    const tripFinal = await getTrip(db, 'lapland');
    expect(tripFinal?.convertedTravellers).toEqual(['Alice', 'bob']);
  });

  it('atomically links an explicitly selected existing profile, snapshots classification, and records conversion marker', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Alice', 'Bob']));

    const aliceId = await createTraveller(db, 'Alice', 'adult');

    const result = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Alice',
      existingTravellerId: aliceId,
    });

    expect(result).toEqual({ travellerId: aliceId, created: false, alreadyConverted: false });

    // Membership created with adult snapshot
    const members = await listTripTravellers(db, 'lapland');
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: aliceId, name: 'Alice', classification: 'adult' });

    // Conversion marker saved on trip
    const trip = await getTrip(db, 'lapland');
    expect(trip?.convertedTravellers).toEqual(['Alice']);

    // Original trip.travellers preserved!
    expect(trip?.travellers).toEqual(['Alice', 'Bob']);

    // legacyNames excludes Alice
    const profiles = await listTravellers(db);
    const unres = legacyNames(
      trip?.travellers ?? [],
      members,
      profiles,
      trip?.convertedTravellers ?? [],
    );
    expect(unres.map((u) => u.name)).toEqual(['Bob']);
  });

  it('atomically creates a new profile, saves membership with classification, and records conversion marker', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Bob']));

    const result = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Bob',
    });

    expect(result.created).toBe(true);
    expect(result.alreadyConverted).toBe(false);
    expect(result.travellerId).toBeDefined();

    // Profile created
    const profiles = await listTravellers(db);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: result.travellerId,
      name: 'Bob',
      classification: 'unspecified',
    });

    // Membership created
    const members = await listTripTravellers(db, 'lapland');
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      id: result.travellerId,
      name: 'Bob',
      classification: 'unspecified',
    });

    // Conversion marker recorded on trip
    const trip = await getTrip(db, 'lapland');
    expect(trip?.convertedTravellers).toEqual(['Bob']);

    // Original trip.travellers preserved!
    expect(trip?.travellers).toEqual(['Bob']);

    // legacyNames is empty
    const unres = legacyNames(
      trip?.travellers ?? [],
      members,
      profiles,
      trip?.convertedTravellers ?? [],
    );
    expect(unres).toHaveLength(0);
  });

  it('rolls back all writes including newly created profile when saving conversion marker fails', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Charlie']));

    // Trigger failure on updating trips.converted_travellers
    raw.exec(`
      CREATE TRIGGER fail_marker_save
      BEFORE UPDATE OF converted_travellers ON trips
      BEGIN
        SELECT RAISE(ABORT, 'Simulated conversion marker save failure');
      END;
    `);

    await expect(
      convertLegacyTraveller(db, {
        tripId: 'lapland',
        legacyName: 'Charlie',
      }),
    ).rejects.toThrow(/Simulated conversion marker save failure/);

    // Profile must NOT exist (rolled back)
    const profiles = await listTravellers(db);
    expect(profiles.find((p) => p.name === 'Charlie')).toBeUndefined();

    // Trip membership must NOT exist (rolled back)
    const members = await listTripTravellers(db, 'lapland');
    expect(members).toHaveLength(0);

    // Trip conversion marker must NOT be updated
    const trip = await getTrip(db, 'lapland');
    expect(trip?.convertedTravellers).toEqual([]);

    // legacyNames still offers Charlie
    const unres = legacyNames(
      trip?.travellers ?? [],
      members,
      profiles,
      trip?.convertedTravellers ?? [],
    );
    expect(unres.map((u) => u.name)).toEqual(['Charlie']);
  });

  it('succeeds on retry after failure without duplicates', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Charlie']));

    // 1. Injected failure
    raw.exec(`
      CREATE TRIGGER fail_marker_save
      BEFORE UPDATE OF converted_travellers ON trips
      BEGIN
        SELECT RAISE(ABORT, 'Simulated failure');
      END;
    `);

    await expect(
      convertLegacyTraveller(db, {
        tripId: 'lapland',
        legacyName: 'Charlie',
      }),
    ).rejects.toThrow();

    // 2. Remove failure trigger
    raw.exec(`DROP TRIGGER fail_marker_save;`);

    // 3. Retry conversion
    const result = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Charlie',
    });

    expect(result.created).toBe(true);

    // Exactly 1 profile
    const profiles = await listTravellers(db);
    expect(profiles.filter((p) => p.name === 'Charlie')).toHaveLength(1);

    // Exactly 1 member
    const members = await listTripTravellers(db, 'lapland');
    expect(members.filter((m) => m.name === 'Charlie')).toHaveLength(1);

    // Exactly 1 conversion marker
    const trip = await getTrip(db, 'lapland');
    expect(trip?.convertedTravellers).toEqual(['Charlie']);
  });

  it('repeated conversion using an existing profile is a no-op and does not duplicate memberships', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Dana']));

    const danaId = await createTraveller(db, 'Dana', 'child');

    // First submission
    const res1 = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Dana',
      existingTravellerId: danaId,
    });
    expect(res1.travellerId).toBe(danaId);
    expect(res1.created).toBe(false);
    expect(res1.alreadyConverted).toBe(false);

    // Repeated submission (e.g. quick tap or retry)
    const res2 = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Dana',
      existingTravellerId: danaId,
    });
    expect(res2.travellerId).toBe(danaId);
    expect(res2.created).toBe(false);
    expect(res2.alreadyConverted).toBe(true);

    // Membership: exactly 1
    const members = await listTripTravellers(db, 'lapland');
    expect(members.filter((m) => m.id === danaId)).toHaveLength(1);

    // Conversion marker: exactly 1
    const trip = await getTrip(db, 'lapland');
    expect(trip?.convertedTravellers).toEqual(['Dana']);
  });

  it('repeated conversion using the new-profile path is a no-op and does not create duplicate profiles or re-add removed travellers', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['George']));

    // 1. First conversion via new-profile path (no existingTravellerId)
    const first = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'George',
    });

    expect(first.created).toBe(true);
    expect(first.alreadyConverted).toBe(false);
    expect(first.travellerId).toBeDefined();

    // 2. Second conversion attempt with the same legacy name (e.g. repeated tap or re-submission)
    const second = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'George',
    });

    expect(second.created).toBe(false);
    expect(second.alreadyConverted).toBe(true);

    // Exactly 1 profile in travellers table
    const profiles = await listTravellers(db);
    expect(profiles.filter((p) => p.name === 'George')).toHaveLength(1);

    // Exactly 1 membership for this trip
    const members = await listTripTravellers(db, 'lapland');
    expect(members.filter((m) => m.name === 'George')).toHaveLength(1);

    // Exactly 1 conversion marker
    const trip = await getTrip(db, 'lapland');
    expect(trip?.convertedTravellers).toEqual(['George']);

    // 3. Remove George from the trip
    await removeTripTraveller(db, 'lapland', first.travellerId!);
    const membersAfterRemove = await listTripTravellers(db, 'lapland');
    expect(membersAfterRemove).toHaveLength(0);

    // 4. Repeated conversion attempt AFTER removal must NOT re-add them to the trip or create a new profile
    const third = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'George',
    });

    expect(third.alreadyConverted).toBe(true);
    expect(third.created).toBe(false);

    // Members must still be empty (not re-added!)
    const membersStillEmpty = await listTripTravellers(db, 'lapland');
    expect(membersStillEmpty).toHaveLength(0);

    // Profiles count unchanged
    const profilesAfter = await listTravellers(db);
    expect(profilesAfter.filter((p) => p.name === 'George')).toHaveLength(1);
  });

  it('removing traveller after successful conversion does not resurrect legacy suggestion', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Eve']));

    const res = await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Eve',
    });

    // Remove Eve from lapland
    await removeTripTraveller(db, 'lapland', res.travellerId!);

    const members = await listTripTravellers(db, 'lapland');
    expect(members).toHaveLength(0);

    const profiles = await listTravellers(db);
    expect(profiles.filter((p) => p.name === 'Eve')).toHaveLength(1);

    const trip = await getTrip(db, 'lapland');
    const unres = legacyNames(
      trip?.travellers ?? [],
      members,
      profiles,
      trip?.convertedTravellers ?? [],
    );
    // Eve does NOT reappear in legacy suggestions!
    expect(unres).toHaveLength(0);
  });

  it('multiple profiles require explicit selection without auto-merging', async () => {
    const { raw, db } = setup();
    raw
      .prepare(`UPDATE trips SET travellers = ? WHERE id = 'lapland'`)
      .run(JSON.stringify(['Frank']));

    const frank1 = await createTraveller(db, 'Frank', 'adult');
    const frank2 = await createTraveller(db, 'Frank', 'child');

    const profiles = await listTravellers(db);
    const trip = await getTrip(db, 'lapland');
    const unres = legacyNames(trip?.travellers ?? [], [], profiles, trip?.convertedTravellers ?? []);

    expect(unres).toHaveLength(1);
    expect(unres[0].matches).toHaveLength(2);
    // When matches.length > 1, the UI displays "Choose profile" and requires an explicit user choice

    // Explicit choice of frank2 (child)
    await convertLegacyTraveller(db, {
      tripId: 'lapland',
      legacyName: 'Frank',
      existingTravellerId: frank2,
    });

    const members = await listTripTravellers(db, 'lapland');
    expect(members).toHaveLength(1);
    expect(members[0].id).toBe(frank2);
    expect(members[0].classification).toBe('child');

    // frank1 remains safe in profiles
    const allProfiles = await listTravellers(db);
    expect(allProfiles.map((p) => p.id)).toContain(frank1);
  });
});
