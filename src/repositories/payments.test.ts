import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import { createExpense, getExpense, updateExpense } from './expenses';
import {
  countMoneyRecords,
  countPayerRecords,
  createBookingPayment,
  deleteBookingPayment,
  lastPayerId,
  listItemPayments,
  listLinkedExpenses,
  unlinkExpense,
  updateBookingPayment,
} from './payments';
import { createTripTraveller, removeTripTraveller } from './travellers';
import { createTripItem, deleteTripItem, getTripItem, setTripItemStatus, updateTripItem } from './tripItems';
import { countTripContents, deleteTrip, getTrip, updateTripWithMembers } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Money records against bookings (3D-1) through the real repositories over better-sqlite3: every
 * refusal leaves the database exactly as it was, and nothing is ever cascaded away with a booking.
 */

const now = '2026-10-21T09:00:00.000Z';
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

/** Every row of every money-bearing table, to show a refusal touched nothing. */
function snapshot(raw: Database.Database) {
  return Object.fromEntries(
    ['trips', 'trip_items', 'trip_travellers', 'booking_payments', 'expenses', 'item_participants'].map(
      (table) => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()],
    ),
  );
}

const pay = (amount: number, payerId: string | null = null, paidOn: string | null = null) => ({
  amount,
  payerId,
  paidOn,
  note: undefined,
});

const spend = (amount: number, extra: Partial<Parameters<typeof createExpense>[2]> = {}) => ({
  category: 'accommodation' as const,
  label: 'Hotel deposit',
  amount,
  currency: 'EUR',
  spentOn: '2026-10-01',
  notes: undefined,
  payerId: null,
  tripItemId: null,
  ...extra,
});

async function hotel(db: Db) {
  const ev = await createTripTraveller(db, 'lapland', 'Evelina', 'adult');
  const ana = await createTripTraveller(db, 'lapland', 'Ana', 'adult');
  const hotelId = await createTripItem(
    db,
    'lapland',
    plan('Hotel Aurora', { priceAmount: 25000, priceCurrency: 'EUR' }),
  );
  return { ev, ana, hotelId };
}

describe('payments against a booking', () => {
  it('is one EUR 250 cost with EUR 250 paid: a deposit and a final payment', async () => {
    const { db } = setup();
    const { ev, hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000, ev, '2026-08-01'));
    await createBookingPayment(db, hotelId, pay(15000, null));

    const item = await getTripItem(db, hotelId);
    expect(item).toMatchObject({ priceAmount: 25000, recordedPaid: 25000, isPaid: false });
    const payments = await listItemPayments(db, hotelId);
    expect(payments.map((p) => [p.amount, p.currency, p.payerId])).toEqual([
      [10000, 'EUR', ev],
      [15000, 'EUR', null],
    ]);
  });

  it('takes the booking’s currency and never writes the Paid switch', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(25000));
    expect(raw.prepare(`SELECT currency FROM booking_payments`).get()).toEqual({ currency: 'EUR' });
    expect(raw.prepare(`SELECT is_paid FROM trip_items WHERE id = ?`).get(hotelId)).toEqual({ is_paid: 0 });
  });

  it('refuses a saved place and a booking without a price, writing nothing', async () => {
    const { raw, db } = setup();
    const idea = await createTripItem(db, 'lapland', plan('Ice hotel', { status: 'idea', priceAmount: 9000, priceCurrency: 'EUR' }));
    const free = await createTripItem(db, 'lapland', plan('Free walk'));
    const before = snapshot(raw);
    await expect(createBookingPayment(db, idea, pay(100))).rejects.toThrow(/saved place/);
    await expect(createBookingPayment(db, free, pay(100))).rejects.toThrow(/Add the price/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('writes nothing when the insert itself fails', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    const before = snapshot(raw);
    await expect(createBookingPayment(db, hotelId, pay(100, 'nobody'))).rejects.toThrow(/FOREIGN KEY/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('edits and deletes a payment only when asked, leaving the booking alone', async () => {
    const { raw, db } = setup();
    const { ev, hotelId } = await hotel(db);
    const id = await createBookingPayment(db, hotelId, pay(10000));
    const itemBefore = raw.prepare(`SELECT * FROM trip_items WHERE id = ?`).get(hotelId);
    await updateBookingPayment(db, id, { amount: 12000, payerId: ev, paidOn: '2026-08-02', note: 'Card' });
    expect(await listItemPayments(db, hotelId)).toMatchObject([
      { amount: 12000, payerId: ev, paidOn: '2026-08-02', note: 'Card', currency: 'EUR' },
    ]);
    await deleteBookingPayment(db, id);
    expect(await listItemPayments(db, hotelId)).toEqual([]);
    expect(raw.prepare(`SELECT * FROM trip_items WHERE id = ?`).get(hotelId)).toEqual(itemBefore);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM expenses`).get()).toEqual({ n: 0 });
  });

  it('offers the last payer on the trip, and only on that trip', async () => {
    const { db } = setup();
    const { ev, ana, hotelId } = await hotel(db);
    expect(await lastPayerId(db, 'lapland')).toBeNull();
    await createBookingPayment(db, hotelId, pay(100, ev));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createExpense(db, 'lapland', spend(500, { payerId: ana }));
    expect(await lastPayerId(db, 'lapland')).toBe(ana);
    expect(await lastPayerId(db, 'milan')).toBeNull();
  });
});

describe('expenses linked to a booking', () => {
  it('counts towards the booking and not as spending of its own', async () => {
    const { db } = setup();
    const { hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000));
    const id = await createExpense(db, 'lapland', spend(15000, { tripItemId: hotelId }));
    expect((await getTripItem(db, hotelId))?.recordedPaid).toBe(25000);
    expect((await listLinkedExpenses(db, hotelId)).map((e) => e.id)).toEqual([id]);
    expect(await countMoneyRecords(db, hotelId)).toEqual({ payments: 1, linkedExpenses: 1 });
  });

  it('refuses a link in another currency, to an idea, or to another trip’s booking — writing nothing', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    const idea = await createTripItem(db, 'lapland', plan('Ice hotel', { status: 'idea', priceAmount: 9000, priceCurrency: 'EUR' }));
    const rome = await createTripItem(db, 'milan', plan('Duomo', { priceAmount: 2000, priceCurrency: 'EUR' }));
    const before = snapshot(raw);
    await expect(createExpense(db, 'lapland', spend(100, { tripItemId: hotelId, currency: 'BGN' }))).rejects.toThrow(
      /never converted/,
    );
    await expect(createExpense(db, 'lapland', spend(100, { tripItemId: idea }))).rejects.toThrow(/saved place/);
    await expect(createExpense(db, 'lapland', spend(100, { tripItemId: rome }))).rejects.toThrow(/not on this trip/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses changing a linked expense to another currency, keeping it as it was', async () => {
    const { db } = setup();
    const { hotelId } = await hotel(db);
    const id = await createExpense(db, 'lapland', spend(15000, { tripItemId: hotelId }));
    await expect(updateExpense(db, id, spend(15000, { tripItemId: hotelId, currency: 'BGN' }))).rejects.toThrow(
      /never converted/,
    );
    expect(await getExpense(db, id)).toMatchObject({ currency: 'EUR', tripItemId: hotelId });
  });

  it('unlinks explicitly: the expense becomes spending again, nothing else changes', async () => {
    const { db } = setup();
    const { ana, hotelId } = await hotel(db);
    const id = await createExpense(db, 'lapland', spend(15000, { tripItemId: hotelId, payerId: ana }));
    await unlinkExpense(db, id);
    expect(await getExpense(db, id)).toMatchObject({ tripItemId: null, payerId: ana, amount: 15000 });
    expect((await getTripItem(db, hotelId))?.recordedPaid).toBe(0);
  });

  it('never touches the legacy paid_by and split', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    const id = await createExpense(db, 'lapland', spend(100));
    raw.prepare(`UPDATE expenses SET paid_by = 'Ana', split = '{"mode":"equal"}' WHERE id = ?`).run(id);
    await updateExpense(db, id, spend(15000, { tripItemId: hotelId }));
    expect(raw.prepare(`SELECT paid_by, split FROM expenses WHERE id = ?`).get(id)).toEqual({
      paid_by: 'Ana',
      split: '{"mode":"equal"}',
    });
  });
});

describe('deleting and editing a booking with money records (L-1)', () => {
  it('refuses to delete it, with the reason, and keeps everything', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000));
    await createBookingPayment(db, hotelId, pay(5000));
    await createExpense(db, 'lapland', spend(10000, { tripItemId: hotelId }));
    const before = snapshot(raw);
    await expect(deleteTripItem(db, hotelId)).rejects.toThrow(
      '“Hotel Aurora” has 2 payments and 1 linked expense. To keep the money history, cancel the booking instead, or remove those records first.',
    );
    expect(snapshot(raw)).toEqual(before);
  });

  it('deletes it once the records are gone', async () => {
    const { db } = setup();
    const { hotelId } = await hotel(db);
    const id = await createBookingPayment(db, hotelId, pay(10000));
    await deleteBookingPayment(db, id);
    await deleteTripItem(db, hotelId);
    expect(await getTripItem(db, hotelId)).toBeNull();
  });

  it('allows cancelling, which keeps the records; refuses turning it into an idea', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000));
    await setTripItemStatus(db, hotelId, 'cancelled');
    expect(await getTripItem(db, hotelId)).toMatchObject({ status: 'cancelled', recordedPaid: 10000 });
    const before = snapshot(raw);
    await expect(setTripItemStatus(db, hotelId, 'idea')).rejects.toThrow(/stays a booking/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses clearing the price or changing its currency; allows a new amount', async () => {
    const { raw, db } = setup();
    const { hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000));
    const before = snapshot(raw);
    await expect(updateTripItem(db, hotelId, plan('Hotel Aurora'))).rejects.toThrow(/keeps a price/);
    await expect(
      updateTripItem(db, hotelId, plan('Hotel Aurora', { priceAmount: 25000, priceCurrency: 'BGN' })),
    ).rejects.toThrow(/stays in EUR/);
    expect(snapshot(raw)).toEqual(before);
    await updateTripItem(db, hotelId, plan('Hotel Aurora', { priceAmount: 8000, priceCurrency: 'EUR' }));
    expect(await getTripItem(db, hotelId)).toMatchObject({ priceAmount: 8000, recordedPaid: 10000 });
  });

  it('a booking without records is edited and deleted as before', async () => {
    const { db } = setup();
    const { hotelId } = await hotel(db);
    await updateTripItem(db, hotelId, plan('Hotel Aurora', { status: 'idea' }));
    await deleteTripItem(db, hotelId);
    expect(await getTripItem(db, hotelId)).toBeNull();
  });
});

describe('a whole trip with money records', () => {
  it('counts its payments for the confirmation, then deletes everything in one go', async () => {
    const { raw, db } = setup();
    const { ev, hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000, ev));
    await createExpense(db, 'lapland', spend(15000, { tripItemId: hotelId, payerId: ev }));
    await createExpense(db, 'lapland', spend(700));
    expect(await countTripContents(db, 'lapland')).toMatchObject({ items: 1, expenses: 2, payments: 1 });

    await deleteTrip(db, 'lapland');

    expect(await getTrip(db, 'lapland')).toBeNull();
    for (const table of ['trip_items', 'booking_payments', 'expenses']) {
      expect(raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(await getTrip(db, 'milan')).not.toBeNull();
  });
});

describe('leaving a trip as a payer (invariant I)', () => {
  it('is refused while they paid something on it; anyone else leaves as before', async () => {
    const { raw, db } = setup();
    const { ev, ana, hotelId } = await hotel(db);
    await createBookingPayment(db, hotelId, pay(10000, ev));
    expect(await countPayerRecords(db, 'lapland', ev)).toBe(1);
    const before = snapshot(raw);
    await expect(removeTripTraveller(db, 'lapland', ev)).rejects.toThrow(
      /Evelina is the payer on 1 money record on this trip/,
    );
    expect(snapshot(raw)).toEqual(before);
    await removeTripTraveller(db, 'lapland', ana);
    expect(raw.prepare(`SELECT traveller_id FROM trip_travellers`).all()).toEqual([{ traveller_id: ev }]);
  });

  it('is refused from the trip form too, before the trip itself is saved', async () => {
    const { raw, db } = setup();
    const { ev, ana } = await hotel(db);
    await createExpense(db, 'lapland', spend(500, { payerId: ana }));
    const before = snapshot(raw);
    const trip = (await getTrip(db, 'lapland'))!;
    await expect(
      updateTripWithMembers(
        db,
        'lapland',
        { name: 'Renamed', startDate: trip.startDate, endDate: trip.endDate, defaultTz: trip.defaultTz },
        [ev],
      ),
    ).rejects.toThrow(/Ana is the payer/);
    expect(snapshot(raw)).toEqual(before);
  });
});
