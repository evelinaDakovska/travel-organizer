import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripBalances } from '../domain/balances';
import { tripItemInputSchema } from '../domain/tripItem';
import { listHolds, moneyHolds, saveSplit, setTripCover } from './costShares';
import { createExpense, deleteExpense } from './expenses';
import { createBookingPayment } from './payments';
import {
  balanceInput,
  createSettlement,
  deleteSettlement,
  getSettlement,
  listTripSettlements,
  updateSettlement,
} from './settlements';
import { createTripTraveller, leaveTripRefusal, removeTripTraveller } from './travellers';
import { createTripItem, deleteTripItem, updateTripItem } from './tripItems';
import { countTripContents, deleteTrip } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Settlements (3E) through the real repositories over better-sqlite3: every refusal leaves every
 * table exactly as it was; nothing but the person's own Delete, or deleting the whole trip, removes
 * a settlement; and balances read from the database agree with the plan's worked examples.
 */

const now = '2026-10-22T09:00:00.000Z';
const schema = tripItemInputSchema('Europe/Helsinki');
const plan = (title: string, extra: Record<string, unknown> = {}) =>
  schema.parse({ kind: 'stay', status: 'confirmed', title, ...extra });

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
      'booking_payments',
      'expenses',
      'cost_shares',
      'trip_cover',
      'settlements',
      'payments',
    ].map((table) => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
  );
}

async function people(db: Db) {
  const ana = await createTripTraveller(db, 'lapland', 'Ana', 'adult');
  const ben = await createTripTraveller(db, 'lapland', 'Ben', 'adult');
  const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
  const outsider = await createTripTraveller(db, 'milan', 'Milan only', 'adult');
  return { ana, ben, mia, outsider };
}

const settlement = (fromId: string, toId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  fromId,
  toId,
  amount,
  currency: 'EUR',
  settledOn: '2026-11-24',
  note: undefined,
  ...extra,
});
const spend = (amount: number, payerId: string | null) => ({
  category: 'transport' as const,
  label: 'Taxi',
  amount,
  currency: 'EUR',
  spentOn: '2026-11-21',
  notes: undefined,
  payerId,
  tripItemId: null,
});
const equal = (...ids: string[]) => ({
  people: ids.map((travellerId) => ({ travellerId, amount: null, coveredBy: null })),
});
const pay = (amount: number, payerId: string | null) => ({ amount, payerId, paidOn: null, note: undefined });
const eurOf = async (db: Db) => tripBalances(await balanceInput(db, 'lapland')).find((e) => e.currency === 'EUR')!;

describe('recording a settlement', () => {
  it('creates, edits and deletes the person’s own record, nothing else changing', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const before = snapshot(raw);
    const id = await createSettlement(db, 'lapland', settlement(ben, ana, 5000, { note: 'Hotel half' }));
    expect(await getSettlement(db, id)).toMatchObject({
      tripId: 'lapland',
      fromId: ben,
      toId: ana,
      amount: 5000,
      currency: 'EUR',
      settledOn: '2026-11-24',
      note: 'Hotel half',
    });
    await updateSettlement(db, id, settlement(ben, ana, 3000, { currency: 'NOK', settledOn: null }));
    expect(await getSettlement(db, id)).toMatchObject({ amount: 3000, currency: 'NOK', settledOn: null, note: null });
    await deleteSettlement(db, id);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses, with every table unchanged: the same person, someone off the trip, a child left owing', async () => {
    const { raw, db } = setup();
    const { ana, ben, mia, outsider } = await people(db);
    const before = snapshot(raw);
    await expect(createSettlement(db, 'lapland', settlement(ana, ana, 100))).rejects.toThrow('Pick two different people.');
    await expect(createSettlement(db, 'lapland', settlement(ana, outsider, 100))).rejects.toThrow(
      'Both people must be on this trip.',
    );
    await expect(createSettlement(db, 'lapland', settlement(ana, mia, 100))).rejects.toThrow(
      'Mia would owe money. A child never owes — record it with the adult who covers Mia.',
    );
    expect(snapshot(raw)).toEqual(before);
    void ben;
  });

  it('checks the child rule inside the transaction, on an edit too', async () => {
    const { raw, db } = setup();
    const { ana, ben, mia } = await people(db);
    // Mia paid for ice cream that Ana and Ben share: she is owed 10.
    const ice = await createExpense(db, 'lapland', spend(1000, mia));
    await saveSplit(db, { expenseId: ice }, equal(ana, ben));
    const id = await createSettlement(db, 'lapland', settlement(ana, mia, 1000));
    const before = snapshot(raw);
    await expect(updateSettlement(db, id, settlement(ana, mia, 1001))).rejects.toThrow(/Mia would owe money/);
    expect(snapshot(raw)).toEqual(before);
  });
});

describe('what keeps someone on the trip, and what deletes a settlement (C)', () => {
  it('a settlement holds both people; the holds list opens it; leaving is refused with nothing changed', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const id = await createSettlement(db, 'lapland', settlement(ben, ana, 5000));
    expect(await moneyHolds(db, 'lapland', ben)).toEqual({ paid: 0, shares: 0, covers: 0, settlements: 1 });
    expect(await leaveTripRefusal(db, 'lapland', ana)).toBe(
      'Ana is on 1 settlement on this trip. Change those first — money history is never moved or deleted by itself.',
    );
    expect(await listHolds(db, 'lapland', ana)).toEqual([
      {
        kind: 'settled',
        paymentId: null,
        settlementId: id,
        itemId: null,
        expenseId: null,
        title: 'Ben → Ana',
        amount: 5000,
        currency: 'EUR',
      },
    ]);
    const before = snapshot(raw);
    await expect(removeTripTraveller(db, 'lapland', ana)).rejects.toThrow(/1 settlement/);
    expect(snapshot(raw)).toEqual(before);
    // Once the person deletes it, they leave as before.
    await deleteSettlement(db, id);
    await removeTripTraveller(db, 'lapland', ana);
    expect(raw.prepare(`SELECT 1 FROM trip_travellers WHERE traveller_id = ?`).all(ana)).toEqual([]);
  });

  it('deleting a booking or an expense never touches a settlement', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const hotel = await createTripItem(db, 'lapland', plan('Hotel', { priceAmount: 25000, priceCurrency: 'EUR' }));
    const taxi = await createExpense(db, 'lapland', spend(3000, ana));
    await saveSplit(db, { expenseId: taxi }, equal(ana, ben));
    await createSettlement(db, 'lapland', settlement(ben, ana, 1500));
    const before = raw.prepare(`SELECT * FROM settlements`).all();
    await deleteExpense(db, taxi);
    await deleteTripItem(db, hotel);
    expect(raw.prepare(`SELECT * FROM settlements`).all()).toEqual(before);
  });

  it('deleting the whole trip names its settlements first, then removes them with it', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    await createSettlement(db, 'lapland', settlement(ben, ana, 1500));
    await createSettlement(db, 'lapland', settlement(ana, ben, 200, { currency: 'NOK' }));
    expect(await countTripContents(db, 'lapland')).toMatchObject({ settlements: 2 });
    await deleteTrip(db, 'lapland');
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM settlements`).get()).toEqual({ n: 0 });
    expect(raw.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('balances read from the database', () => {
  it('regression: the hotel deposit — so far and no suggestion, then final once paid', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const hotel = await createTripItem(db, 'lapland', plan('Hotel Aurora', { priceAmount: 25000, priceCurrency: 'EUR' }));
    await createBookingPayment(db, hotel, pay(10000, ana));
    await saveSplit(db, { itemId: hotel }, equal(ana, ben));
    await createSettlement(db, 'lapland', settlement(ben, ana, 5000));
    const totalsBefore = raw.prepare(`SELECT * FROM trip_items`).all();

    const soFar = await eurOf(db);
    expect(soFar.state).toBe('soFar');
    expect(soFar.transfers).toEqual([]);
    expect(Object.fromEntries(soFar.people.map((row) => [row.travellerId, row.net]))).toEqual({
      [ana]: -5000,
      [ben]: 5000,
    });
    expect(soFar.waiting[0].reason).toEqual({ kind: 'toPay', amount: 15000 });
    // A settlement never writes to a booking.
    expect(raw.prepare(`SELECT * FROM trip_items`).all()).toEqual(totalsBefore);

    await createBookingPayment(db, hotel, pay(15000, ben));
    const final = await eurOf(db);
    expect(final.state).toBe('final');
    expect(final.transfers).toEqual([{ fromId: ana, toId: ben, amount: 7500 }]);
  });

  it('regression: complete, then made incomplete by a price edit — nothing written by reading', async () => {
    const { raw, db } = setup();
    const { ana, ben, mia } = await people(db);
    const safari = await createTripItem(db, 'lapland', plan('Safari', { priceAmount: 9000, priceCurrency: 'EUR' }));
    await createBookingPayment(db, safari, pay(9000, ana));
    await saveSplit(db, { itemId: safari }, equal(ana, ben, mia));
    await setTripCover(db, 'lapland', mia, [ana]);
    await createSettlement(db, 'lapland', settlement(ben, ana, 1000));
    expect((await eurOf(db)).transfers).toEqual([{ fromId: ben, toId: ana, amount: 2000 }]);

    await updateTripItem(db, safari, plan('Safari', { priceAmount: 9900, priceCurrency: 'EUR' }));
    const before = snapshot(raw);
    const edited = await eurOf(db);
    expect(edited.state).toBe('soFar');
    expect(edited.waiting.map((w) => w.reason.kind)).toEqual(['toPay']);
    expect(edited.transfers).toEqual([]);
    expect(snapshot(raw)).toEqual(before);

    await updateTripItem(db, safari, plan('Safari', { priceAmount: 9000, priceCurrency: 'EUR' }));
    expect((await eurOf(db)).transfers).toEqual([{ fromId: ben, toId: ana, amount: 2000 }]);
  });
});

describe('listing', () => {
  it('lists a trip’s settlements by date, undated last, and no other trip’s', async () => {
    const { db } = setup();
    const { ana, ben } = await people(db);
    const late = await createSettlement(db, 'lapland', settlement(ben, ana, 100, { settledOn: '2026-11-25' }));
    const undated = await createSettlement(db, 'lapland', settlement(ben, ana, 200, { settledOn: null }));
    const early = await createSettlement(db, 'lapland', settlement(ben, ana, 300, { settledOn: '2026-11-21' }));
    expect((await listTripSettlements(db, 'lapland')).map((s) => s.id)).toEqual([early, late, undated]);
    expect(await listTripSettlements(db, 'milan')).toEqual([]);
  });
});
