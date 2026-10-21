import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { tripItemInputSchema } from '../domain/tripItem';
import { MoneyRuleError } from '../domain/bookingPayments';
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
    raw.exec(`CREATE TEMP TRIGGER fail_insert BEFORE INSERT ON booking_payments
              BEGIN SELECT RAISE(ABORT, 'injected: insert'); END`);
    const before = snapshot(raw);
    await expect(createBookingPayment(db, hotelId, pay(100))).rejects.toThrow('injected: insert');
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

describe('editing a payment: the same checks as recording one, at the repository', () => {
  async function recorded(db: Db) {
    const fixture = await hotel(db);
    const id = await createBookingPayment(db, fixture.hotelId, pay(10000, fixture.ev, '2026-08-01'));
    return { ...fixture, id };
  }

  it('saves a valid edit, and only amount, payer, date and note', async () => {
    const { raw, db } = setup();
    const { ana, hotelId, id } = await recorded(db);
    await updateBookingPayment(db, id, { amount: 12000, payerId: ana, paidOn: null, note: 'Card' });
    expect(
      raw
        .prepare(`SELECT trip_id, trip_item_id, payer_id, amount, currency, paid_on, note FROM booking_payments`)
        .get(),
    ).toEqual({
      trip_id: 'lapland',
      trip_item_id: hotelId,
      payer_id: ana,
      amount: 12000,
      currency: 'EUR',
      paid_on: null,
      note: 'Card',
    });
  });

  it('refuses a payment that is not there, writing nothing', async () => {
    const { raw, db } = setup();
    await recorded(db);
    const before = snapshot(raw);
    await expect(updateBookingPayment(db, 'ghost', pay(100))).rejects.toThrow(/not here any more/);
    expect(snapshot(raw)).toEqual(before);
  });

  it.each([
    ['zero', 0],
    ['a negative amount', -500],
    ['a fraction of a cent', 10.5],
    ['not a number', Number.NaN],
  ])('refuses %s, keeping the record as it was', async (_what, amount) => {
    const { raw, db } = setup();
    const { id } = await recorded(db);
    const before = snapshot(raw);
    await expect(updateBookingPayment(db, id, pay(amount))).rejects.toThrow(MoneyRuleError);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses a malformed date, keeping the record as it was', async () => {
    const { raw, db } = setup();
    const { id } = await recorded(db);
    const before = snapshot(raw);
    await expect(updateBookingPayment(db, id, pay(100, null, '1 Aug'))).rejects.toThrow(/Pick a date/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses a payer who does not exist, or who is on another trip only', async () => {
    const { raw, db } = setup();
    const { id } = await recorded(db);
    const romeOnly = await createTripTraveller(db, 'milan', 'Rome only', 'adult');
    const before = snapshot(raw);
    await expect(updateBookingPayment(db, id, pay(100, 'nobody'))).rejects.toThrow(/must be on this trip/);
    await expect(updateBookingPayment(db, id, pay(100, romeOnly))).rejects.toThrow(/must be on this trip/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses someone who has left the trip; not recorded is always allowed', async () => {
    const { raw, db } = setup();
    const { ana, id } = await recorded(db);
    await removeTripTraveller(db, 'lapland', ana);
    const before = snapshot(raw);
    await expect(updateBookingPayment(db, id, pay(100, ana))).rejects.toThrow(/must be on this trip/);
    expect(snapshot(raw)).toEqual(before);
    await updateBookingPayment(db, id, pay(100, null));
    expect(paymentRow(raw, id)).toMatchObject({ amount: 100, payer_id: null });
  });

  it('keeps a payer the record already names, even one no longer on the trip (restored data)', async () => {
    const { raw, db } = setup();
    const { ana, id } = await recorded(db);
    // Not reachable through the app (a payer cannot leave); only a restored record could look like this.
    raw.prepare(`UPDATE booking_payments SET payer_id = ? WHERE id = ?`).run(ana, id);
    raw.prepare(`DELETE FROM trip_travellers WHERE traveller_id = ?`).run(ana);
    await updateBookingPayment(db, id, { ...pay(10000, ana), note: 'Fixed note' });
    expect(paymentRow(raw, id)).toMatchObject({ payer_id: ana, note: 'Fixed note' });
  });

  it('refuses an edit once the booking is no longer eligible, keeping the record', async () => {
    const { raw, db } = setup();
    const { id, hotelId } = await recorded(db);
    // The repositories never allow these (editRefusal); only data from elsewhere could hold them.
    const cases: [string, RegExp][] = [
      [`UPDATE trip_items SET status = 'idea' WHERE id = ?`, /saved place/],
      [`UPDATE trip_items SET status = 'confirmed', price_currency = 'BGN' WHERE id = ?`, /never converted/],
      [`UPDATE trip_items SET price_currency = 'EUR', price_amount = NULL WHERE id = ?`, /Add the price/],
    ];
    for (const [sql, reason] of cases) {
      raw.prepare(sql).run(hotelId);
      const before = snapshot(raw);
      await expect(updateBookingPayment(db, id, pay(100))).rejects.toThrow(reason);
      expect(snapshot(raw)).toEqual(before);
    }
  });

  it('cannot move a payment to another booking, trip or currency', async () => {
    const { raw, db } = setup();
    const { hotelId, id } = await recorded(db);
    const duomo = await createTripItem(db, 'milan', plan('Duomo', { priceAmount: 2000, priceCurrency: 'EUR' }));
    const sneaky = { ...pay(100), tripItemId: duomo, tripId: 'milan', currency: 'BGN' } as never;
    await updateBookingPayment(db, id, sneaky);
    expect(paymentRow(raw, id)).toMatchObject({
      trip_id: 'lapland',
      trip_item_id: hotelId,
      currency: 'EUR',
      amount: 100,
    });
  });

  it('rolls back when the write itself fails after the checks', async () => {
    const { raw, db } = setup();
    const { id } = await recorded(db);
    raw.exec(`CREATE TEMP TRIGGER fail_edit BEFORE UPDATE ON booking_payments
              BEGIN SELECT RAISE(ABORT, 'injected: edit'); END`);
    const before = snapshot(raw);
    await expect(updateBookingPayment(db, id, pay(100))).rejects.toThrow('injected: edit');
    expect(snapshot(raw)).toEqual(before);
  });
});

describe('a payer is on the record’s trip (invariant P)', () => {
  it('a new payment: refuses another trip’s traveller and a bad amount; accepts a member or nobody', async () => {
    const { raw, db } = setup();
    const { ev, hotelId } = await hotel(db);
    const romeOnly = await createTripTraveller(db, 'milan', 'Rome only', 'adult');
    const before = snapshot(raw);
    await expect(createBookingPayment(db, hotelId, pay(100, romeOnly))).rejects.toThrow(/must be on this trip/);
    await expect(createBookingPayment(db, hotelId, pay(0))).rejects.toThrow(/above zero/);
    await expect(createBookingPayment(db, hotelId, pay(10.5))).rejects.toThrow(MoneyRuleError);
    expect(snapshot(raw)).toEqual(before);
    await createBookingPayment(db, hotelId, pay(100, ev));
    await createBookingPayment(db, hotelId, pay(100));
    expect(raw.prepare(`SELECT payer_id FROM booking_payments ORDER BY rowid`).all()).toEqual([
      { payer_id: ev },
      { payer_id: null },
    ]);
  });

  it('a new expense, linked or standalone: refuses another trip’s traveller', async () => {
    const { raw, db } = setup();
    const { ana, hotelId } = await hotel(db);
    const romeOnly = await createTripTraveller(db, 'milan', 'Rome only', 'adult');
    const before = snapshot(raw);
    await expect(createExpense(db, 'lapland', spend(500, { payerId: romeOnly }))).rejects.toThrow(
      /must be on this trip/,
    );
    await expect(
      createExpense(db, 'lapland', spend(500, { payerId: romeOnly, tripItemId: hotelId })),
    ).rejects.toThrow(/must be on this trip/);
    expect(snapshot(raw)).toEqual(before);
    const id = await createExpense(db, 'lapland', spend(500, { payerId: ana }));
    expect(await getExpense(db, id)).toMatchObject({ payerId: ana, tripItemId: null });
  });

  it('an edited expense: refuses a new payer off the trip, keeps the one it names', async () => {
    const { raw, db } = setup();
    const { ana } = await hotel(db);
    const romeOnly = await createTripTraveller(db, 'milan', 'Rome only', 'adult');
    const id = await createExpense(db, 'lapland', spend(500, { payerId: ana }));
    const before = snapshot(raw);
    await expect(updateExpense(db, id, spend(500, { payerId: romeOnly }))).rejects.toThrow(/must be on this trip/);
    expect(snapshot(raw)).toEqual(before);
    // Restored data only: the payer is no longer a member; editing the amount keeps them.
    raw.prepare(`DELETE FROM trip_travellers WHERE traveller_id = ?`).run(ana);
    await updateExpense(db, id, spend(700, { payerId: ana }));
    expect(await getExpense(db, id)).toMatchObject({ amount: 700, payerId: ana });
  });

  it('unlinking keeps the payer and changes nothing else', async () => {
    const { db } = setup();
    const { ana, hotelId } = await hotel(db);
    const id = await createExpense(db, 'lapland', spend(15000, { payerId: ana, tripItemId: hotelId }));
    const before = await getExpense(db, id);
    await unlinkExpense(db, id);
    const after = await getExpense(db, id);
    expect({ ...after, tripItemId: hotelId, updatedAt: before!.updatedAt }).toEqual(before);
  });
});

function paymentRow(raw: Database.Database, id: string) {
  return raw.prepare(`SELECT * FROM booking_payments WHERE id = ?`).get(id);
}
