import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import type { TripInput } from '../domain/trip';
import { tripItemInputSchema } from '../domain/tripItem';
import { createBookingPayment } from './payments';
import {
  createTraveller,
  createTripTraveller,
  updateTripTravellerClassification,
} from './travellers';
import { createTripItem } from './tripItems';
import { updateTripWithMembers } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * The trip form's save (`updateTripWithMembers`) is one transaction: the trip's fields, who leaves
 * and who joins are all written or none are. Failures are injected with triggers on the real
 * schema over better-sqlite3, and the whole database is compared before and after.
 */

const now = '2026-10-21T09:00:00.000Z';

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  raw
    .prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('lapland', 'Lapland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
    )
    .run(now, now);
  return { raw, db: asyncDatabase(raw) };
}

type Db = ReturnType<typeof setup>['db'];

function snapshot(raw: Database.Database) {
  return Object.fromEntries(
    [
      'trips',
      'trip_items',
      'travellers',
      'trip_travellers',
      'item_participants',
      'booking_payments',
      'expenses',
    ].map((table) => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
  );
}

/** Ev and Ana on the trip, Kid a child profile counted as an adult on this trip, Mo not on it. */
async function family(db: Db) {
  const ev = await createTripTraveller(db, 'lapland', 'Evelina', 'adult');
  const ana = await createTripTraveller(db, 'lapland', 'Ana', 'adult');
  const kid = await createTripTraveller(db, 'lapland', 'Kid', 'child');
  await updateTripTravellerClassification(db, 'lapland', kid, 'adult');
  const mo = await createTraveller(db, 'Mo', 'adult');
  const schema = tripItemInputSchema('Europe/Helsinki');
  const safari = await createTripItem(
    db,
    'lapland',
    schema.parse({
      kind: 'activity',
      status: 'confirmed',
      title: 'Husky safari',
      startDate: '2026-11-21',
      startTime: '10:00',
      priceAmount: 30000,
      priceCurrency: 'EUR',
    }),
    [ev, ana, kid],
  );
  return { ev, ana, kid, mo, safari };
}

const fields = (extra: Partial<TripInput> = {}): TripInput => ({
  name: 'Lapland renamed',
  startDate: '2026-11-20',
  endDate: '2026-11-24',
  defaultTz: 'Europe/Helsinki',
  ...extra,
});

const members = (raw: Database.Database) =>
  raw
    .prepare(`SELECT traveller_id, classification FROM trip_travellers ORDER BY sort_order`)
    .all();

describe('updateTripWithMembers — one transaction for the whole save', () => {
  it('saves the fields, removes and adds members, keeping overrides and participation', async () => {
    const { raw, db } = setup();
    const { ev, ana, kid, mo, safari } = await family(db);

    await updateTripWithMembers(db, 'lapland', fields(), [ev, kid, mo]);

    expect(raw.prepare(`SELECT name FROM trips WHERE id = 'lapland'`).get()).toEqual({
      name: 'Lapland renamed',
    });
    expect(members(raw)).toEqual([
      { traveller_id: ev, classification: 'adult' },
      // The trip's override stays; the profile is still a child.
      { traveller_id: kid, classification: 'adult' },
      // A new member takes the profile's classification.
      { traveller_id: mo, classification: 'adult' },
    ]);
    expect(raw.prepare(`SELECT classification FROM travellers WHERE id = ?`).get(kid)).toEqual({
      classification: 'child',
    });
    // Who stays keeps their place on the safari; who leaves is taken off it; who joins is not added.
    expect(
      raw.prepare(`SELECT traveller_id FROM item_participants WHERE item_id = ? ORDER BY traveller_id`).all(safari),
    ).toEqual([ev, kid].sort().map((traveller_id) => ({ traveller_id })));
  });

  it('rolls everything back when removing a member fails part-way', async () => {
    const { raw, db } = setup();
    const { ev, ana, kid, mo } = await family(db);
    // Fails after Ana's participation is already deleted, on the membership row itself.
    raw.exec(`CREATE TEMP TRIGGER fail_leave BEFORE DELETE ON trip_travellers
              WHEN OLD.traveller_id = '${ana}' BEGIN SELECT RAISE(ABORT, 'injected: leave'); END`);
    const before = snapshot(raw);

    await expect(updateTripWithMembers(db, 'lapland', fields(), [ev, kid, mo])).rejects.toThrow(
      'injected: leave',
    );

    expect(snapshot(raw)).toEqual(before);
  });

  it('rolls everything back when adding a member fails, after the fields and a removal', async () => {
    const { raw, db } = setup();
    const { ev, kid, mo } = await family(db);
    raw.exec(`CREATE TEMP TRIGGER fail_join BEFORE INSERT ON trip_travellers
              BEGIN SELECT RAISE(ABORT, 'injected: join'); END`);
    const before = snapshot(raw);

    await expect(updateTripWithMembers(db, 'lapland', fields(), [ev, kid, mo])).rejects.toThrow(
      'injected: join',
    );

    expect(snapshot(raw)).toEqual(before);
  });

  it('rolls everything back when a selected traveller does not exist', async () => {
    const { raw, db } = setup();
    const { ev, kid } = await family(db);
    const before = snapshot(raw);

    await expect(updateTripWithMembers(db, 'lapland', fields(), [ev, kid, 'ghost'])).rejects.toThrow(
      /FOREIGN KEY/,
    );

    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses unticking a payer before writing anything, payments and prices untouched', async () => {
    const { raw, db } = setup();
    const { ev, ana, kid, mo, safari } = await family(db);
    await createBookingPayment(db, safari, { amount: 10000, payerId: ana, paidOn: null, note: undefined });
    const before = snapshot(raw);

    await expect(updateTripWithMembers(db, 'lapland', fields(), [ev, kid, mo])).rejects.toThrow(
      /Ana is the payer on 1 money record/,
    );

    expect(snapshot(raw)).toEqual(before);
  });

  it('rolls back a new zone’s recomputed instants with the rest', async () => {
    const { raw, db } = setup();
    const { ev, ana, kid, mo } = await family(db);
    raw.exec(`CREATE TEMP TRIGGER fail_join BEFORE INSERT ON trip_travellers
              BEGIN SELECT RAISE(ABORT, 'injected: join'); END`);
    const before = snapshot(raw);

    await expect(
      updateTripWithMembers(db, 'lapland', fields({ defaultTz: 'Europe/Sofia' }), [ev, ana, kid, mo]),
    ).rejects.toThrow('injected: join');

    expect(snapshot(raw)).toEqual(before);
    // And without the failure the same save does recompute them — the rollback is what kept them.
    raw.exec(`DROP TRIGGER fail_join`);
    await updateTripWithMembers(db, 'lapland', fields({ defaultTz: 'Europe/Sofia' }), [ev, ana, kid, mo]);
    expect(raw.prepare(`SELECT default_tz FROM trips`).get()).toEqual({ default_tz: 'Europe/Sofia' });
  });
});

describe('dates set later, or taken away (Phase 6, P6-8)', () => {
  /** Everything but the trip's own row: what must not move when only its dates change. */
  const rest = (raw: Database.Database) => {
    const { trips: _trips, ...others } = snapshot(raw);
    return others;
  };

  it('removing the dates and setting them again changes only the two columns', async () => {
    const { raw, db } = setup();
    const { ev, ana, kid, safari } = await family(db);
    await createBookingPayment(db, safari, { amount: 10000, payerId: ev, paidOn: '2026-10-01', note: undefined });
    const before = rest(raw);

    await updateTripWithMembers(db, 'lapland', fields({ startDate: null, endDate: null }), [ev, ana, kid]);
    expect(raw.prepare(`SELECT start_date, end_date FROM trips`).get()).toEqual({ start_date: null, end_date: null });
    expect(rest(raw)).toEqual(before);

    await updateTripWithMembers(db, 'lapland', fields({ startDate: '2027-01-10', endDate: '2027-01-12' }), [ev, ana, kid]);
    expect(raw.prepare(`SELECT start_date, end_date FROM trips`).get()).toEqual({
      start_date: '2027-01-10',
      end_date: '2027-01-12',
    });
    // The safari keeps its own date (21 Nov): nothing is moved to fit the trip (CLAUDE.md §5.7).
    expect(rest(raw)).toEqual(before);
  });
});
