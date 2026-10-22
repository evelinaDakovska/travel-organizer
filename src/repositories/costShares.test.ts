import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { shareAmounts, type SplitBasis } from '../domain/costShares';
import { tripItemInputSchema } from '../domain/tripItem';
import {
  listHolds,
  listShares,
  listTripCover,
  moneyHolds,
  removeSplit,
  saveSplit,
  setTripCover,
  splitFacts,
} from './costShares';
import { createExpense, deleteExpense, getExpense, updateExpense } from './expenses';
import { createBookingPayment } from './payments';
import {
  createTraveller,
  createTripTraveller,
  listTripTravellers,
  removeTripTraveller,
  updateTripTravellerClassification,
} from './travellers';
import { createTripItem, deleteTripItem, getTripItem, setTripItemStatus, updateTripItem } from './tripItems';
import { countTripContents, deleteTrip, updateTripWithMembers } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Splits and *Covered by* (3D-2) through the real repositories over better-sqlite3: every refusal
 * leaves every table exactly as it was, and nothing is moved or deleted that the person did not ask.
 */

const now = '2026-10-21T09:00:00.000Z';
const schema = tripItemInputSchema('Europe/Helsinki');
const plan = (title: string, extra: Record<string, unknown> = {}) =>
  schema.parse({ kind: 'activity', status: 'confirmed', title, ...extra });

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
      'cost_shares',
      'trip_cover',
    ].map((table) => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
  );
}

/** Evelina and Ana (adults), Mia and Leo (children), and a safari for EUR 90. */
async function family(db: Db) {
  const ev = await createTripTraveller(db, 'lapland', 'Evelina', 'adult');
  const ana = await createTripTraveller(db, 'lapland', 'Ana', 'adult');
  const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
  const leo = await createTripTraveller(db, 'lapland', 'Leo', 'child');
  const safari = await createTripItem(db, 'lapland', plan('Husky safari', { priceAmount: 9000, priceCurrency: 'EUR' }));
  return { ev, ana, mia, leo, safari };
}

const equal = (...ids: string[]) => ({
  people: ids.map((travellerId) => ({ travellerId, amount: null, coveredBy: null })),
});
const byAmounts = (...rows: [string, number][]) => ({
  people: rows.map(([travellerId, amount]) => ({ travellerId, amount, coveredBy: null })),
});
const spend = (amount: number, extra: Record<string, unknown> = {}) => ({
  category: 'transport' as const,
  label: 'Taxi',
  amount,
  currency: 'EUR',
  spentOn: '2026-11-21',
  notes: undefined,
  payerId: null,
  tripItemId: null,
  ...extra,
});

describe('saving a split', () => {
  it('splits a booking equally, in the order given, following the current price', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    const itemBefore = raw.prepare(`SELECT * FROM trip_items WHERE id = ?`).get(safari);
    await saveSplit(db, { itemId: safari }, equal(ev, ana, mia));
    const shares = await listShares(db, { itemId: safari });
    expect(shares.map((s) => [s.travellerId, s.amount, s.sortOrder, s.tripId])).toEqual([
      [ev, null, 0, 'lapland'],
      [ana, null, 1, 'lapland'],
      [mia, null, 2, 'lapland'],
    ]);
    expect(shareAmounts(9000, shares).shares.map((s) => s.amount)).toEqual([3000, 3000, 3000]);
    // Nothing about the booking changes: price, paid, participants.
    expect(raw.prepare(`SELECT * FROM trip_items WHERE id = ?`).get(safari)).toEqual(itemBefore);
    await updateTripItem(db, safari, plan('Husky safari', { priceAmount: 10000, priceCurrency: 'EUR' }));
    expect(shareAmounts(10000, await listShares(db, { itemId: safari })).shares.map((s) => s.amount)).toEqual([
      3334, 3333, 3333,
    ]);
  });

  it('replaces the split as a whole, and removes it only when asked', async () => {
    const { db } = setup();
    const { ev, ana, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    await saveSplit(db, { itemId: safari }, byAmounts([ana, 6000], [ev, 3000]));
    expect((await listShares(db, { itemId: safari })).map((s) => [s.travellerId, s.amount])).toEqual([
      [ana, 6000],
      [ev, 3000],
    ]);
    expect(await splitFacts(db, { itemId: safari })).toEqual({ people: 2, mode: 'amounts', allocated: 9000 });
    await removeSplit(db, { itemId: safari });
    expect(await listShares(db, { itemId: safari })).toEqual([]);
    expect(await splitFacts(db, { itemId: safari })).toEqual({ people: 0, mode: null, allocated: 0 });
  });

  it('splits a standalone expense', async () => {
    const { db } = setup();
    const { ev, ana } = await family(db);
    const taxi = await createExpense(db, 'lapland', spend(1000));
    await saveSplit(db, { expenseId: taxi }, equal(ev, ana));
    expect((await listShares(db, { expenseId: taxi })).map((s) => s.expenseId)).toEqual([taxi, taxi]);
  });

  it('refuses, writing nothing: amounts that do not add up, a stranger, mixed rows, an idea, a linked expense', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    const idea = await createTripItem(db, 'lapland', plan('Ice hotel', { status: 'idea', priceAmount: 9000, priceCurrency: 'EUR' }));
    const linked = await createExpense(db, 'lapland', spend(9000, { tripItemId: safari }));
    const romeOnly = await createTripTraveller(db, 'milan', 'Rome only', 'adult');
    const before = snapshot(raw);

    await expect(saveSplit(db, { itemId: safari }, byAmounts([ev, 4000], [ana, 4000]))).rejects.toThrow(
      'EUR 10.00 is left to split.',
    );
    await expect(saveSplit(db, { itemId: safari }, equal(ev, romeOnly))).rejects.toThrow(/on this trip/);
    await expect(
      saveSplit(db, { itemId: safari }, {
        people: [
          { travellerId: ev, amount: 9000, coveredBy: null },
          { travellerId: ana, amount: null, coveredBy: null },
        ],
      }),
    ).rejects.toThrow(/everyone an amount/);
    await expect(saveSplit(db, { itemId: safari }, equal(mia, mia))).rejects.toThrow(/twice/);
    await expect(saveSplit(db, { itemId: idea }, equal(ev))).rejects.toThrow(/budget/);
    await expect(saveSplit(db, { expenseId: linked }, equal(ev))).rejects.toThrow(/pays for “Husky safari”/);
    await expect(saveSplit(db, { itemId: 'ghost' }, equal(ev))).rejects.toThrow(/not here any more/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('rolls the old split back when a write fails part-way', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    raw.exec(`CREATE TEMP TRIGGER fail_share BEFORE INSERT ON cost_shares
              WHEN NEW.traveller_id = '${mia}' BEGIN SELECT RAISE(ABORT, 'injected: share'); END`);
    const before = snapshot(raw);
    await expect(saveSplit(db, { itemId: safari }, equal(ev, ana, mia))).rejects.toThrow('injected: share');
    expect(snapshot(raw)).toEqual(before);
  });
});

describe('who covers a child’s share', () => {
  it('a per-share override by an adult of the trip; refused on an adult’s share or by a child', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, leo, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, {
      people: [
        { travellerId: ev, amount: null, coveredBy: null },
        { travellerId: mia, amount: null, coveredBy: ana },
      ],
    });
    expect((await listShares(db, { itemId: safari })).map((s) => s.coveredBy)).toEqual([null, ana]);
    const before = snapshot(raw);
    const covered = (travellerId: string, coveredBy: string) => ({
      people: [{ travellerId, amount: null, coveredBy }],
    });
    await expect(saveSplit(db, { itemId: safari }, covered(ev, ana))).rejects.toThrow(/Only a child’s share/);
    await expect(saveSplit(db, { itemId: safari }, covered(mia, leo))).rejects.toThrow(/not an adult/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('the trip’s Covered by: one or more adults in order, replaced or cleared as a whole', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, leo } = await family(db);
    await setTripCover(db, 'lapland', mia, [ana, ev]);
    expect(await listTripCover(db, 'lapland')).toEqual([
      { childId: mia, adultId: ana, sortOrder: 0 },
      { childId: mia, adultId: ev, sortOrder: 1 },
    ]);
    await setTripCover(db, 'lapland', mia, [ev]);
    expect((await listTripCover(db, 'lapland')).map((c) => c.adultId)).toEqual([ev]);
    const before = snapshot(raw);
    await expect(setTripCover(db, 'lapland', mia, [leo])).rejects.toThrow(/not an adult/);
    await expect(setTripCover(db, 'lapland', ev, [ana])).rejects.toThrow(/not a child/);
    await expect(setTripCover(db, 'milan', mia, [ev])).rejects.toThrow(/not on this trip/);
    expect(snapshot(raw)).toEqual(before);
    await setTripCover(db, 'lapland', mia, []);
    expect(await listTripCover(db, 'lapland')).toEqual([]);
  });

  it('a reclassification keeps every saved row; only the reading changes', async () => {
    const { raw, db } = setup();
    const { ev, mia, safari } = await family(db);
    await setTripCover(db, 'lapland', mia, [ev]);
    await saveSplit(db, { itemId: safari }, { people: [{ travellerId: mia, amount: null, coveredBy: ev }] });
    const before = { shares: snapshot(raw).cost_shares, cover: snapshot(raw).trip_cover };
    await updateTripTravellerClassification(db, 'lapland', mia, 'adult');
    expect({ shares: snapshot(raw).cost_shares, cover: snapshot(raw).trip_cover }).toEqual(before);
  });
});

describe('editing and deleting a split cost', () => {
  it('a split booking stays a booking with a price; an amounts split keeps its currency', async () => {
    const { raw, db } = setup();
    const { ev, ana, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, byAmounts([ev, 5000], [ana, 4000]));
    const before = snapshot(raw);
    await expect(setTripItemStatus(db, safari, 'idea')).rejects.toThrow(/stays a booking/);
    await expect(updateTripItem(db, safari, plan('Husky safari'))).rejects.toThrow(/keeps a price/);
    await expect(
      updateTripItem(db, safari, plan('Husky safari', { priceAmount: 9000, priceCurrency: 'BGN' })),
    ).rejects.toThrow(/stays in EUR/);
    expect(snapshot(raw)).toEqual(before);
    // A new amount is saved; the split stays as saved and no longer adds up.
    await updateTripItem(db, safari, plan('Husky safari', { priceAmount: 10000, priceCurrency: 'EUR' }));
    expect(shareAmounts(10000, await listShares(db, { itemId: safari })).unallocated).toBe(1000);
    await setTripItemStatus(db, safari, 'cancelled');
    expect((await listShares(db, { itemId: safari })).length).toBe(2);
  });

  it('an equal split follows a new currency', async () => {
    const { db } = setup();
    const { ev, ana, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    await updateTripItem(db, safari, plan('Husky safari', { priceAmount: 9000, priceCurrency: 'BGN' }));
    expect((await getTripItem(db, safari))?.priceCurrency).toBe('BGN');
  });

  it('a split expense keeps its currency by amounts and cannot be linked to a booking', async () => {
    const { raw, db } = setup();
    const { ev, ana, safari } = await family(db);
    const taxi = await createExpense(db, 'lapland', spend(1000));
    await saveSplit(db, { expenseId: taxi }, byAmounts([ev, 600], [ana, 400]));
    const before = snapshot(raw);
    await expect(updateExpense(db, taxi, spend(1000, { currency: 'BGN' }))).rejects.toThrow(/stays in EUR/);
    await expect(updateExpense(db, taxi, spend(1000, { tripItemId: safari }))).rejects.toThrow(
      /split with the booking — remove this split first/,
    );
    expect(snapshot(raw)).toEqual(before);
    await updateExpense(db, taxi, spend(1200));
    expect(shareAmounts(1200, await listShares(db, { expenseId: taxi })).unallocated).toBe(200);
  });

  it('a split goes with its booking or expense, and the trip’s count names splits', async () => {
    const { raw, db } = setup();
    const { ev, ana, safari } = await family(db);
    const taxi = await createExpense(db, 'lapland', spend(1000));
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    await saveSplit(db, { expenseId: taxi }, equal(ev, ana));
    expect(await countTripContents(db, 'lapland')).toMatchObject({ splits: 2 });
    await deleteTripItem(db, safari);
    await deleteExpense(db, taxi);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM cost_shares`).get()).toEqual({ n: 0 });
  });

  it('a booking with payments is still refused, split or not', async () => {
    const { raw, db } = setup();
    const { ev, ana, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    await createBookingPayment(db, safari, { amount: 3000, payerId: ana, paidOn: null, note: undefined });
    const before = snapshot(raw);
    await expect(deleteTripItem(db, safari)).rejects.toThrow(/1 payment/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('a whole trip goes with its splits and covers; another trip is untouched', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    const romeOnly = await createTripTraveller(db, 'milan', 'Rome only', 'adult');
    const duomo = await createTripItem(db, 'milan', plan('Duomo', { priceAmount: 2000, priceCurrency: 'EUR' }));
    await saveSplit(db, { itemId: duomo }, equal(romeOnly));
    await saveSplit(db, { itemId: safari }, { people: [{ travellerId: mia, amount: null, coveredBy: ana }] });
    await setTripCover(db, 'lapland', mia, [ev]);
    await deleteTrip(db, 'lapland');
    expect(raw.prepare(`SELECT trip_id FROM cost_shares`).all()).toEqual([{ trip_id: 'milan' }]);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trip_cover`).get()).toEqual({ n: 0 });
    expect(raw.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('leaving a trip with money on it (invariant I, §7)', () => {
  it('refuses someone in a split or covering a share by override, naming what holds them', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, {
      people: [
        { travellerId: ev, amount: null, coveredBy: null },
        { travellerId: mia, amount: null, coveredBy: ana },
      ],
    });
    const taxi = await createExpense(db, 'lapland', spend(1000, { payerId: ana }));
    expect(await moneyHolds(db, 'lapland', ana)).toEqual({ paid: 1, shares: 0, covers: 1 });
    expect(await moneyHolds(db, 'lapland', mia)).toEqual({ paid: 0, shares: 1, covers: 0 });
    const before = snapshot(raw);
    await expect(removeTripTraveller(db, 'lapland', ana)).rejects.toThrow(
      'Ana is the payer on 1 money record and covering a child’s share on 1 cost on this trip.',
    );
    await expect(removeTripTraveller(db, 'lapland', mia)).rejects.toThrow('Mia is in 1 split on this trip.');
    await expect(
      updateTripWithMembers(db, 'lapland', { name: 'x', startDate: '2026-11-20', endDate: '2026-11-24', defaultTz: 'Europe/Helsinki' }, [ev, ana]),
    ).rejects.toThrow(/Mia is in 1 split/);
    expect(snapshot(raw)).toEqual(before);

    expect(await listHolds(db, 'lapland', ana)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'paid', expenseId: taxi, title: 'Taxi', amount: 1000 }),
        expect.objectContaining({ kind: 'covers', itemId: safari, title: 'Husky safari', amount: null }),
      ]),
    );
    expect(await listHolds(db, 'lapland', mia)).toEqual([
      expect.objectContaining({ kind: 'share', itemId: safari, title: 'Husky safari', currency: 'EUR' }),
    ]);
  });

  it('once each record is changed by the person, they leave as before', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, mia));
    await saveSplit(db, { itemId: safari }, equal(ev));
    await removeTripTraveller(db, 'lapland', mia);
    expect(raw.prepare(`SELECT traveller_id FROM trip_travellers WHERE traveller_id = ?`).all(mia)).toEqual([]);
    expect(await moneyHolds(db, 'lapland', ana)).toEqual({ paid: 0, shares: 0, covers: 0 });
  });

  it('a default cover is a setting: it goes with the adult, leaving the child not covered', async () => {
    const { raw, db } = setup();
    const { ana, mia } = await family(db);
    await setTripCover(db, 'lapland', mia, [ana]);
    await removeTripTraveller(db, 'lapland', ana);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trip_cover`).get()).toEqual({ n: 0 });
  });

  it('a new profile joining the trip changes no split', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, leo, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, ana));
    const before = snapshot(raw).cost_shares;
    const mo = await createTraveller(db, 'Mo', 'adult');
    await updateTripWithMembers(db, 'lapland', { name: 'lapland', startDate: '2026-11-20', endDate: '2026-11-24', defaultTz: 'Europe/Helsinki' }, [ev, ana, mia, leo, mo]);
    expect(snapshot(raw).cost_shares).toEqual(before);
  });
});

describe('saving a draft made against older data (3D-2 corrective)', () => {
  /** What the split screen read when the draft started, as it passes it to the save. */
  async function seenFor(db: Db, owner: { itemId: string } | { expenseId: string }): Promise<SplitBasis> {
    const cost =
      'itemId' in owner
        ? await getTripItem(db, owner.itemId).then((i) => ({ total: i!.priceAmount!, currency: i!.priceCurrency! }))
        : await getExpense(db, owner.expenseId).then((e) => ({ total: e!.amount, currency: e!.currency }));
    return { ...cost, members: await listTripTravellers(db, 'lapland'), shares: await listShares(db, owner) };
  }
  const changed = /This changed while you were editing: .* Nothing was saved/;

  it('1. refuses when the price changed after the draft, and leaves everything as it was', async () => {
    const { raw, db } = setup();
    const { ev, ana, safari } = await family(db);
    const seen = await seenFor(db, { itemId: safari });
    await updateTripItem(db, safari, plan('Husky safari', { priceAmount: 12000, priceCurrency: 'EUR' }));
    const before = snapshot(raw);
    await expect(saveSplit(db, { itemId: safari }, equal(ev, ana), seen)).rejects.toThrow(
      /The cost is now EUR 120.00, not EUR 90.00/,
    );
    await expect(saveSplit(db, { itemId: safari }, byAmounts([ev, 6000], [ana, 6000]), seen)).rejects.toThrow(changed);
    expect(snapshot(raw)).toEqual(before);
    // An expense's amount, the same way.
    const taxi = await createExpense(db, 'lapland', spend(1000));
    const seenTaxi = await seenFor(db, { expenseId: taxi });
    await updateExpense(db, taxi, spend(1500));
    await expect(saveSplit(db, { expenseId: taxi }, equal(ev, ana), seenTaxi)).rejects.toThrow(changed);
    expect(await listShares(db, { expenseId: taxi })).toEqual([]);
  });

  it('2. refuses when the currency changed, even when the typed amounts add up in the new one', async () => {
    const { raw, db } = setup();
    const { ev, ana, safari } = await family(db);
    const seen = await seenFor(db, { itemId: safari });
    await updateTripItem(db, safari, plan('Husky safari', { priceAmount: 9000, priceCurrency: 'BGN' }));
    const before = snapshot(raw);
    await expect(saveSplit(db, { itemId: safari }, byAmounts([ev, 5000], [ana, 4000]), seen)).rejects.toThrow(
      /The cost is now BGN 90.00, not EUR 90.00/,
    );
    expect(snapshot(raw)).toEqual(before);
  });

  it('3. refuses when someone in the draft has left the trip', async () => {
    const { raw, db } = setup();
    const { ev, ana, leo, safari } = await family(db);
    const seen = await seenFor(db, { itemId: safari });
    await removeTripTraveller(db, 'lapland', leo);
    const before = snapshot(raw);
    await expect(saveSplit(db, { itemId: safari }, equal(ev, ana, leo), seen)).rejects.toThrow(
      /Leo is no longer on this trip/,
    );
    expect(snapshot(raw)).toEqual(before);
  });

  it('4. refuses when someone the draft names changed between adult and child', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    const seen = await seenFor(db, { itemId: safari });
    await updateTripTravellerClassification(db, 'lapland', mia, 'adult');
    await expect(saveSplit(db, { itemId: safari }, equal(ev, mia), seen)).rejects.toThrow(/Mia is now an adult/);
    await updateTripTravellerClassification(db, 'lapland', mia, 'child');
    await updateTripTravellerClassification(db, 'lapland', ana, 'child');
    const before = snapshot(raw);
    await expect(
      saveSplit(db, { itemId: safari }, { people: [{ travellerId: mia, amount: null, coveredBy: ana }] }, seen),
    ).rejects.toThrow(/Ana is now a child/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('5. the trip’s Covered by changing does not stop the save, and is never written into it', async () => {
    const { db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    const seen = await seenFor(db, { itemId: safari });
    await setTripCover(db, 'lapland', mia, [ana]);
    await saveSplit(db, { itemId: safari }, equal(ev, mia), seen);
    expect((await listShares(db, { itemId: safari })).map((s) => s.coveredBy)).toEqual([null, null]);
    expect(await listTripCover(db, 'lapland')).toMatchObject([{ childId: mia, adultId: ana }]);
  });

  it('6. refuses when the saved split or an override changed elsewhere; the same split saved again is no change', async () => {
    const { raw, db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    await saveSplit(db, { itemId: safari }, equal(ev, mia));
    const seen = await seenFor(db, { itemId: safari });
    // Saved again elsewhere unchanged: new ids, the same split.
    await saveSplit(db, { itemId: safari }, equal(ev, mia));
    await saveSplit(db, { itemId: safari }, equal(ev, ana, mia), seen);
    const seenAgain = await seenFor(db, { itemId: safari });
    await saveSplit(db, { itemId: safari }, {
      people: [
        { travellerId: ev, amount: null, coveredBy: null },
        { travellerId: ana, amount: null, coveredBy: null },
        { travellerId: mia, amount: null, coveredBy: ana },
      ],
    });
    const before = snapshot(raw);
    await expect(saveSplit(db, { itemId: safari }, equal(ev, mia), seenAgain)).rejects.toThrow(
      /The saved split was changed somewhere else/,
    );
    expect(snapshot(raw)).toEqual(before);
    await removeSplit(db, { itemId: safari });
    await expect(saveSplit(db, { itemId: safari }, equal(ev, mia), seenAgain)).rejects.toThrow(changed);
    expect(await listShares(db, { itemId: safari })).toEqual([]);
  });

  it('7. a harmless change — someone joining, an unnamed member reclassified — saves the draft', async () => {
    const { db } = setup();
    const { ev, ana, leo, safari } = await family(db);
    const seen = await seenFor(db, { itemId: safari });
    await createTripTraveller(db, 'lapland', 'Sam', 'unspecified');
    await updateTripTravellerClassification(db, 'lapland', leo, 'adult');
    await saveSplit(db, { itemId: safari }, byAmounts([ev, 5000], [ana, 4000]), seen);
    expect((await listShares(db, { itemId: safari })).map((s) => [s.travellerId, s.amount])).toEqual([
      [ev, 5000],
      [ana, 4000],
    ]);
  });

  it('8. a draft kept over a change (seen taken again) saves, still under every split rule', async () => {
    const { db } = setup();
    const { ev, ana, safari } = await family(db);
    await updateTripItem(db, safari, plan('Husky safari', { priceAmount: 12000, priceCurrency: 'EUR' }));
    const kept = await seenFor(db, { itemId: safari });
    await expect(saveSplit(db, { itemId: safari }, byAmounts([ev, 5000], [ana, 4000]), kept)).rejects.toThrow(
      /EUR 30.00 is left to split/,
    );
    await saveSplit(db, { itemId: safari }, byAmounts([ev, 6000], [ana, 6000]), kept);
    expect(await listShares(db, { itemId: safari })).toHaveLength(2);
  });

  it('9. an unchanged draft saves as before', async () => {
    const { db } = setup();
    const { ev, ana, mia, safari } = await family(db);
    await setTripCover(db, 'lapland', mia, [ev]);
    const seen = await seenFor(db, { itemId: safari });
    await saveSplit(db, { itemId: safari }, equal(ev, ana, mia), seen);
    const saved = await listShares(db, { itemId: safari });
    expect(shareAmounts(9000, saved).shares.map((s) => s.amount)).toEqual([3000, 3000, 3000]);
    expect(saved.map((s) => s.coveredBy)).toEqual([null, null, null]);
  });
});
