import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { costFingerprint, tripBalances } from '../domain/balances';
import { MoneyRuleError } from '../domain/bookingPayments';
import { tripItemInputSchema } from '../domain/tripItem';
import { listHolds, moneyHolds, removeSplit, saveSplit, setTripCover } from './costShares';
import { createExpense, deleteExpense, updateExpense } from './expenses';
import { createBookingPayment, deleteBookingPayment, unlinkExpense, updateBookingPayment } from './payments';
import {
  balanceInput,
  createSettlement,
  deleteSettlement,
  getSettlement,
  keepOutside,
  listTripSettlements,
  reviewAgain,
  updateSettlement,
} from './settlements';
import { createTripTraveller, leaveTripRefusal, removeTripTraveller } from './travellers';
import { createTripItem, deleteTripItem, setTripItemStatus, updateTripItem } from './tripItems';
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
      'unsplit_confirmations',
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
    // Both leave a currency with settlements, so each asks first (§15); continued, no settlement changes.
    await deleteExpense(db, taxi, { acceptSettlementReview: true });
    await deleteTripItem(db, hotel, { acceptSettlementReview: true });
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

describe('the repository checks its input itself (review P2)', () => {
  // Shapes TypeScript would stop, sent anyway: what a caller without the form could pass at runtime.
  const malformed: [string, Record<string, unknown>, RegExp | string][] = [
    ['a fractional amount', { amount: 10.5 }, /./],
    ['a zero amount', { amount: 0 }, 'Enter an amount above zero'],
    ['a negative amount', { amount: -100 }, 'Enter an amount above zero'],
    ['an amount as text', { amount: '100' }, 'Enter an amount like 12.50'],
    ['a missing amount', { amount: undefined }, 'Enter the amount'],
    ['NaN', { amount: Number.NaN }, /./],
    ['Infinity', { amount: Number.POSITIVE_INFINITY }, /./],
    ['a lowercase currency', { currency: 'eur' }, 'Use a three-letter code like EUR'],
    ['a four-letter currency', { currency: 'EURO' }, 'Use a three-letter code like EUR'],
    ['an empty currency', { currency: '' }, 'Use a three-letter code like EUR'],
    ['a currency that is not text', { currency: 978 }, /./],
    ['a date that does not exist', { settledOn: '2026-02-30' }, 'Pick a date'],
    ['month 13', { settledOn: '2026-13-01' }, 'Pick a date'],
    ['a date in another format', { settledOn: '24.11.2026' }, 'Pick a date'],
    ['a date with a time', { settledOn: '2026-11-24T10:00' }, 'Pick a date'],
    ['a missing date (not null)', { settledOn: undefined }, /./],
    ['a note over 500 characters', { note: 'x'.repeat(501) }, /./],
    ['a note that is not text', { note: 42 }, /./],
    ['an empty sender', { fromId: '' }, 'Pick who paid'],
    ['a sender that is not text', { fromId: null }, /./],
    ['an empty receiver', { toId: '' }, 'Pick who received it'],
  ];

  it.each(malformed)('create refuses %s, every table unchanged', async (_, change, message) => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const before = snapshot(raw);
    const input = settlement(ben, ana, 5000, change) as never;
    await expect(createSettlement(db, 'lapland', input)).rejects.toThrow(MoneyRuleError);
    await expect(createSettlement(db, 'lapland', input)).rejects.toThrow(message);
    expect(snapshot(raw)).toEqual(before);
  });

  it.each(malformed)('update refuses %s, the saved settlement and every table unchanged', async (_, change, message) => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const id = await createSettlement(db, 'lapland', settlement(ben, ana, 5000, { note: 'Hotel half' }));
    const before = snapshot(raw);
    const input = settlement(ben, ana, 5000, change) as never;
    await expect(updateSettlement(db, id, input)).rejects.toThrow(MoneyRuleError);
    await expect(updateSettlement(db, id, input)).rejects.toThrow(message);
    expect(snapshot(raw)).toEqual(before);
  });

  it('refuses no input at all, on create and update', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const id = await createSettlement(db, 'lapland', settlement(ben, ana, 5000));
    const before = snapshot(raw);
    await expect(createSettlement(db, 'lapland', null as never)).rejects.toThrow(MoneyRuleError);
    await expect(updateSettlement(db, id, undefined as never)).rejects.toThrow(MoneyRuleError);
    expect(snapshot(raw)).toEqual(before);
  });

  it('stores what the schema makes of the input: the currency trimmed, a blank note as none, nothing extra', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await people(db);
    const input = settlement(ben, ana, 5000, { currency: ' NOK ', note: '   ', tripId: 'milan', id: 'mine' });
    const id = await createSettlement(db, 'lapland', input as never);
    expect(id).not.toBe('mine');
    expect(await getSettlement(db, id)).toMatchObject({ tripId: 'lapland', currency: 'NOK', note: null });
    await updateSettlement(db, id, settlement(ben, ana, 4000, { currency: 'EUR ', note: '  Paid back  ' }));
    expect(await getSettlement(db, id)).toMatchObject({ amount: 4000, currency: 'EUR', note: 'Paid back' });
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM settlements`).get()).toEqual({ n: 1 });
  });

  it('keeps the money rules after the schema: child and membership refusals read as before', async () => {
    const { db } = setup();
    const { ana, mia, outsider } = await people(db);
    await expect(createSettlement(db, 'lapland', settlement(ana, outsider, 100))).rejects.toThrow(
      'Both people must be on this trip.',
    );
    await expect(createSettlement(db, 'lapland', settlement(ana, mia, 100))).rejects.toThrow(/Mia would owe money/);
  });
});

describe('unsplit costs kept outside, through the database (§14.2, review P1)', () => {
  // Ben owes Ana half of a taxi (30) and a museum (20) she paid; he settles 15 for the taxi.
  async function settledTrip(db: Db) {
    const { ana, ben, mia } = await people(db);
    const taxi = await createExpense(db, 'lapland', spend(3000, ana));
    const museum = await createExpense(db, 'lapland', { ...spend(2000, ana), label: 'Museum' });
    await saveSplit(db, { expenseId: taxi }, equal(ana, ben));
    await saveSplit(db, { expenseId: museum }, equal(ana, ben));
    await createSettlement(db, 'lapland', settlement(ben, ana, 1500));
    return { ana, ben, mia, taxi, museum };
  }
  // …and an unsplit hotel Ana paid in full.
  async function withHotel(db: Db) {
    const trip = await settledTrip(db);
    const hotel = await createTripItem(db, 'lapland', plan('Hotel', { priceAmount: 20000, priceCurrency: 'EUR' }));
    const paid = await createBookingPayment(db, hotel, pay(20000, trip.ana));
    return { ...trip, hotel, paid };
  }
  const seen = async (db: Db, id: string) =>
    costFingerprint((await balanceInput(db, 'lapland')).costs.find((cost) => cost.id === id)!);
  const keep = async (db: Db, kind: 'booking' | 'expense', id: string) =>
    keepOutside(db, 'lapland', { kind, id }, await seen(db, id));
  const confirmations = (raw: Database.Database) =>
    raw.prepare(`SELECT trip_item_id, expense_id FROM unsplit_confirmations ORDER BY rowid`).all();

  it('1–5: split removed after settling → held; kept outside → the suggestion resumes; reviewed again → held', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await settledTrip(db);
    expect((await eurOf(db)).transfers).toEqual([{ fromId: ben, toId: ana, amount: 1000 }]);

    await removeSplit(db, { expenseId: taxi });
    const held = await eurOf(db);
    expect(held.state).toBe('review');
    expect(held.transfers).toEqual([]);
    expect(held.toReview.map((c) => c.id)).toEqual([taxi]);

    const before = snapshot(raw);
    await keep(db, 'expense', taxi);
    const kept = await eurOf(db);
    expect(kept.state).toBe('final');
    expect(kept.transfers).toEqual([{ fromId: ana, toId: ben, amount: 500 }]);
    // Only the confirmation was written: every money table as it was.
    expect({ ...snapshot(raw), unsplit_confirmations: [] }).toEqual(before);
    expect(confirmations(raw)).toEqual([{ trip_item_id: null, expense_id: taxi }]);

    await reviewAgain(db, { kind: 'expense', id: taxi });
    expect(snapshot(raw)).toEqual(before);
    expect((await eurOf(db)).state).toBe('review');
  });

  it('3–6, a booking: an unsplit hotel held; kept → suggestions resume; reviewed again → held; a new one held', async () => {
    const { raw, db } = setup();
    const { ana, ben, hotel } = await withHotel(db);
    const held = await eurOf(db);
    expect(held.state).toBe('review');
    expect(held.toReview.map((c) => c.id)).toEqual([hotel]);
    expect(held.transfers).toEqual([]);

    const before = snapshot(raw);
    await keep(db, 'booking', hotel);
    expect({ ...snapshot(raw), unsplit_confirmations: [] }).toEqual(before);
    expect((await eurOf(db)).transfers).toEqual([{ fromId: ben, toId: ana, amount: 1000 }]);

    await reviewAgain(db, { kind: 'booking', id: hotel });
    expect((await eurOf(db)).state).toBe('review');

    await keep(db, 'booking', hotel);
    const cabin = await createTripItem(db, 'lapland', plan('Cabin', { priceAmount: 9000, priceCurrency: 'EUR' }));
    const entry = await eurOf(db);
    expect(entry.toReview.map((c) => c.id)).toEqual([cabin]);
    expect(entry.keptOutside.map((c) => c.id)).toEqual([hotel]);
    expect(entry.transfers).toEqual([]);
  });

  it('6: a new unsplit cost needs its own confirmation', async () => {
    const { db } = setup();
    const { ben, taxi } = await settledTrip(db);
    await removeSplit(db, { expenseId: taxi });
    await keep(db, 'expense', taxi);
    const soup = await createExpense(db, 'lapland', { ...spend(1200, ben), label: 'Soup' });
    const entry = await eurOf(db);
    expect(entry.state).toBe('review');
    expect(entry.toReview.map((c) => c.id)).toEqual([soup]);
    expect(entry.keptOutside.map((c) => c.id)).toEqual([taxi]);
  });

  describe('7–10: financial edits make it stale; others keep it', () => {
    const bookingEdits: [string, (db: Db, t: Awaited<ReturnType<typeof withHotel>>) => Promise<unknown>][] = [
      ['the price', (db, t) => updateTripItem(db, t.hotel, plan('Hotel', { priceAmount: 21000, priceCurrency: 'EUR' }))],
      ['the status (cancelled)', (db, t) => setTripItemStatus(db, t.hotel, 'cancelled')],
      ['a payment added', (db, t) => createBookingPayment(db, t.hotel, pay(100, t.ben))],
      ['a payment’s amount', (db, t) => updateBookingPayment(db, t.paid, pay(19000, t.ana))],
      ['a payment’s payer', (db, t) => updateBookingPayment(db, t.paid, pay(20000, t.ben))],
      ['a payment removed', (db, t) => deleteBookingPayment(db, t.paid)],
      ['a linked expense added', (db, t) => createExpense(db, 'lapland', { ...spend(100, t.ben), tripItemId: t.hotel })],
    ];
    for (const [what, change] of bookingEdits) {
      it(`booking — ${what}: no longer kept outside`, async () => {
        const { db } = setup();
        const t = await withHotel(db);
        await keep(db, 'booking', t.hotel);
        expect((await eurOf(db)).keptOutside.map((c) => c.id)).toEqual([t.hotel]);
        await change(db, t);
        expect((await eurOf(db)).keptOutside.map((c) => c.id)).not.toContain(t.hotel);
      });
    }

    it('booking — a linked expense’s amount changed: no longer kept outside', async () => {
      const { db } = setup();
      const t = await withHotel(db);
      const linked = await createExpense(db, 'lapland', { ...spend(100, t.ben), tripItemId: t.hotel });
      await keep(db, 'booking', t.hotel);
      await updateExpense(db, linked, { ...spend(200, t.ben), tripItemId: t.hotel });
      expect((await eurOf(db)).toReview.map((c) => c.id)).toEqual([t.hotel]);
    });

    it('booking — renamed, notes and dates changed: still kept outside', async () => {
      const { db } = setup();
      const t = await withHotel(db);
      await keep(db, 'booking', t.hotel);
      await updateTripItem(
        db,
        t.hotel,
        plan('Hotel Aurora', { priceAmount: 20000, priceCurrency: 'EUR', notes: 'Late check-in', start: { local: '2026-11-21' } }),
      );
      const entry = await eurOf(db);
      expect(entry.keptOutside.map((c) => c.id)).toEqual([t.hotel]);
      expect(entry.state).toBe('final');
    });

    it('expense — amount, payer or currency changed: stale; label, notes, date, category: kept', async () => {
      const { db } = setup();
      const t = await settledTrip(db);
      await removeSplit(db, { expenseId: t.taxi });
      await keep(db, 'expense', t.taxi);
      await updateExpense(db, t.taxi, { ...spend(3000, t.ana), label: 'Airport taxi', notes: 'card', spentOn: '2026-11-23', category: 'food' });
      expect((await eurOf(db)).keptOutside.map((c) => c.id)).toEqual([t.taxi]);
      for (const changed of [spend(3100, t.ana), spend(3000, t.ben), spend(3000, null)]) {
        await keep(db, 'expense', t.taxi);
        await updateExpense(db, t.taxi, changed);
        expect((await eurOf(db)).toReview.map((c) => c.id)).toEqual([t.taxi]);
        await updateExpense(db, t.taxi, spend(3000, t.ana));
      }
      await keep(db, 'expense', t.taxi);
      await updateExpense(db, t.taxi, { ...spend(3000, t.ana), currency: 'NOK' });
      const nok = tripBalances(await balanceInput(db, 'lapland')).find((e) => e.currency === 'NOK')!;
      expect(nok.keptOutside).toEqual([]);
    });

    it('a split made and removed again ends it for good, though the cost reads the same', async () => {
      const { raw, db } = setup();
      const t = await settledTrip(db);
      await removeSplit(db, { expenseId: t.taxi });
      await keep(db, 'expense', t.taxi);
      await saveSplit(db, { expenseId: t.taxi }, equal(t.ana, t.ben));
      expect(confirmations(raw)).toEqual([]);
      await removeSplit(db, { expenseId: t.taxi });
      expect((await eurOf(db)).toReview.map((c) => c.id)).toEqual([t.taxi]);
    });
  });

  describe('a financial edit ends it for good, even when undone (review follow-up, §14.4)', () => {
    type Hotel = Awaited<ReturnType<typeof withHotel>>;
    const hotelAt = (priceAmount: number, extra: Record<string, unknown> = {}) =>
      plan('Hotel', { priceAmount, priceCurrency: 'EUR', ...extra });
    const linkedRow = (raw: Database.Database, hotel: string) =>
      (raw.prepare(`SELECT id FROM expenses WHERE trip_item_id = ?`).get(hotel) as { id: string }).id;

    // [what, the change, the change undone]: after both, the cost reads exactly as when it was kept.
    const bookingCases: [string, (db: Db, t: Hotel) => Promise<unknown>, (db: Db, t: Hotel, raw: Database.Database) => Promise<unknown>][] = [
      ['1: the price 200 → 210 → 200', (db, t) => updateTripItem(db, t.hotel, hotelAt(21000)), (db, t) => updateTripItem(db, t.hotel, hotelAt(20000))],
      ['the status cancelled, then restored', (db, t) => setTripItemStatus(db, t.hotel, 'cancelled'), (db, t) => setTripItemStatus(db, t.hotel, 'confirmed')],
      ['*Paid* switched on, then off', (db, t) => updateTripItem(db, t.hotel, hotelAt(20000, { isPaid: true })), (db, t) => updateTripItem(db, t.hotel, hotelAt(20000))],
      ['3: a payment’s payer Ana → Ben → Ana', (db, t) => updateBookingPayment(db, t.paid, pay(20000, t.ben)), (db, t) => updateBookingPayment(db, t.paid, pay(20000, t.ana))],
      ['a payment’s amount changed and changed back', (db, t) => updateBookingPayment(db, t.paid, pay(19000, t.ana)), (db, t) => updateBookingPayment(db, t.paid, pay(20000, t.ana))],
      ['4: a payment deleted, and recorded again identically', (db, t) => deleteBookingPayment(db, t.paid), (db, t) => createBookingPayment(db, t.hotel, pay(20000, t.ana))],
      ['a linked expense added, then deleted', (db, t) => createExpense(db, 'lapland', { ...spend(100, t.ben), tripItemId: t.hotel }), (db, t, raw) => deleteExpense(db, linkedRow(raw, t.hotel))],
    ];
    for (const [what, change, undo] of bookingCases) {
      it(`booking — ${what}: back to review, no confirmation stored`, async () => {
        const { raw, db } = setup();
        const t = await withHotel(db);
        await keep(db, 'booking', t.hotel);
        await change(db, t);
        expect(confirmations(raw)).toEqual([]);
        await undo(db, t, raw);
        expect(confirmations(raw)).toEqual([]);
        const entry = await eurOf(db);
        expect(entry.state).toBe('review');
        expect(entry.toReview.map((c) => c.id)).toEqual([t.hotel]);
        expect(entry.transfers).toEqual([]);
        // It reads as it did when kept, so a fresh, deliberate *Keep outside* is still possible.
        await keep(db, 'booking', t.hotel);
        expect((await eurOf(db)).keptOutside.map((c) => c.id)).toEqual([t.hotel]);
      });
    }

    // 5: the hotel's own payment stays; a linked expense from Ben is part of the cost when it is kept.
    async function withLinked(db: Db) {
      const t = await withHotel(db);
      await updateTripItem(db, t.hotel, hotelAt(20500));
      const linked = await createExpense(db, 'lapland', { ...spend(500, t.ben), tripItemId: t.hotel });
      await keep(db, 'booking', t.hotel);
      return { ...t, linked };
    }
    const linkedCases: [string, (db: Db, t: Awaited<ReturnType<typeof withLinked>>) => Promise<unknown>, (db: Db, t: Awaited<ReturnType<typeof withLinked>>) => Promise<unknown>][] = [
      ['its amount', (db, t) => updateExpense(db, t.linked, { ...spend(600, t.ben), tripItemId: t.hotel }), (db, t) => updateExpense(db, t.linked, { ...spend(500, t.ben), tripItemId: t.hotel })],
      ['its payer', (db, t) => updateExpense(db, t.linked, { ...spend(500, t.ana), tripItemId: t.hotel }), (db, t) => updateExpense(db, t.linked, { ...spend(500, t.ben), tripItemId: t.hotel })],
      ['unlinked, then linked again', (db, t) => unlinkExpense(db, t.linked), (db, t) => updateExpense(db, t.linked, { ...spend(500, t.ben), tripItemId: t.hotel })],
    ];
    for (const [what, change, undo] of linkedCases) {
      it(`5: a linked expense — ${what} changed and changed back: back to review`, async () => {
        const { raw, db } = setup();
        const t = await withLinked(db);
        expect(confirmations(raw)).toEqual([{ trip_item_id: t.hotel, expense_id: null }]);
        await change(db, t);
        await undo(db, t);
        expect(confirmations(raw)).toEqual([]);
        expect((await eurOf(db)).toReview.map((c) => c.id)).toEqual([t.hotel]);
      });
    }

    it('a standalone expense — amount, payer or currency changed and changed back: back to review each time', async () => {
      const { raw, db } = setup();
      const t = await settledTrip(db);
      await removeSplit(db, { expenseId: t.taxi });
      for (const changed of [spend(3100, t.ana), spend(3000, t.ben), spend(3000, null), { ...spend(3000, t.ana), currency: 'NOK' }]) {
        await keep(db, 'expense', t.taxi);
        await updateExpense(db, t.taxi, changed);
        await updateExpense(db, t.taxi, spend(3000, t.ana));
        expect(confirmations(raw)).toEqual([]);
        expect((await eurOf(db)).toReview.map((c) => c.id)).toEqual([t.taxi]);
      }
    });

    it('2: renamed, notes, dates, category changed: the confirmation row is not touched', async () => {
      const { raw, db } = setup();
      const t = await withHotel(db);
      await removeSplit(db, { expenseId: t.taxi });
      await keep(db, 'booking', t.hotel);
      await keep(db, 'expense', t.taxi);
      const kept = raw.prepare(`SELECT * FROM unsplit_confirmations ORDER BY rowid`).all();
      await updateTripItem(db, t.hotel, hotelAt(20000, { title: 'Hotel Aurora', notes: 'Late check-in', start: { local: '2026-11-21' } }));
      await updateExpense(db, t.taxi, { ...spend(3000, t.ana), label: 'Airport taxi', notes: 'card', spentOn: '2026-11-23', category: 'food' });
      expect(raw.prepare(`SELECT * FROM unsplit_confirmations ORDER BY rowid`).all()).toEqual(kept);
      expect((await eurOf(db)).keptOutside.map((c) => c.id).sort()).toEqual([t.hotel, t.taxi].sort());
    });

    it('6: a split added, changed and removed: the confirmation is gone at the first, and stays gone', async () => {
      const { raw, db } = setup();
      const t = await withHotel(db);
      await keep(db, 'booking', t.hotel);
      await saveSplit(db, { itemId: t.hotel }, equal(t.ana, t.ben));
      expect(confirmations(raw)).toEqual([]);
      await saveSplit(db, { itemId: t.hotel }, equal(t.ana, t.ben, t.mia));
      await removeSplit(db, { itemId: t.hotel });
      expect(confirmations(raw)).toEqual([]);
      expect((await eurOf(db)).toReview.map((c) => c.id)).toEqual([t.hotel]);
    });

    it('7: a screen that saw the cost before a change is refused, nothing written', async () => {
      const { raw, db } = setup();
      const t = await withHotel(db);
      const seenThen = await seen(db, t.hotel);
      await updateTripItem(db, t.hotel, hotelAt(21000));
      const before = snapshot(raw);
      await expect(keepOutside(db, 'lapland', { kind: 'booking', id: t.hotel }, seenThen)).rejects.toThrow(
        'This cost changed while you were looking at it',
      );
      expect(snapshot(raw)).toEqual(before);
    });

    it('9: a refused financial edit leaves the confirmation exactly as it was', async () => {
      const { raw, db } = setup();
      const t = await withHotel(db);
      await removeSplit(db, { expenseId: t.taxi });
      await keep(db, 'booking', t.hotel);
      await keep(db, 'expense', t.taxi);
      const before = snapshot(raw);
      const refused: (() => Promise<unknown>)[] = [
        () => updateBookingPayment(db, t.paid, pay(0, t.ana)),
        () => updateBookingPayment(db, t.paid, pay(20000, 'nobody')),
        () => createBookingPayment(db, t.hotel, pay(150.5, t.ana)),
        () => updateTripItem(db, t.hotel, hotelAt(20000, { priceCurrency: 'NOK' })),
        () => updateExpense(db, t.taxi, spend(10.5, t.ana)),
        () => updateExpense(db, t.taxi, { ...spend(3000, t.ana), currency: 'eur' }),
        () => createExpense(db, 'lapland', { ...spend(100, 'nobody'), tripItemId: t.hotel }),
      ];
      for (const attempt of refused) {
        await expect(attempt()).rejects.toThrow();
        expect(snapshot(raw)).toEqual(before);
      }
    });

    it('a write to another cost, or to another trip, leaves the confirmation alone', async () => {
      const { raw, db } = setup();
      const t = await withHotel(db);
      await keep(db, 'booking', t.hotel);
      const kept = raw.prepare(`SELECT * FROM unsplit_confirmations`).all();
      await updateExpense(db, t.museum, { ...spend(2200, t.ana), label: 'Museum' });
      const elsewhere = await createTripTraveller(db, 'milan', 'Eli', 'adult');
      await createExpense(db, 'milan', spend(900, elsewhere));
      expect(raw.prepare(`SELECT * FROM unsplit_confirmations`).all()).toEqual(kept);
    });
  });

  it('18: deleting the cost deletes its confirmation, and no settlement', async () => {
    const { raw, db } = setup();
    const t = await withHotel(db);
    await removeSplit(db, { expenseId: t.taxi });
    await keep(db, 'expense', t.taxi);
    await keep(db, 'booking', t.hotel);
    const settlementsBefore = raw.prepare(`SELECT * FROM settlements`).all();
    await deleteExpense(db, t.taxi);
    expect(confirmations(raw)).toEqual([{ trip_item_id: t.hotel, expense_id: null }]);
    await deleteBookingPayment(db, t.paid);
    // Its payment gone, the hotel is no longer the cost that was kept outside: to review, so deleting it asks (§15).
    await deleteTripItem(db, t.hotel, { acceptSettlementReview: true });
    expect(confirmations(raw)).toEqual([]);
    expect(raw.prepare(`SELECT * FROM settlements`).all()).toEqual(settlementsBefore);
  });

  it('19–20: a stale or wrong confirmation is refused inside the transaction, nothing written', async () => {
    const { raw, db } = setup();
    const t = await withHotel(db);
    await removeSplit(db, { expenseId: t.taxi });
    const stale = await seen(db, t.taxi);
    // Someone changes the amount after the screen read it.
    await updateExpense(db, t.taxi, spend(3300, t.ana));
    const before = snapshot(raw);
    await expect(keepOutside(db, 'lapland', { kind: 'expense', id: t.taxi }, stale)).rejects.toThrow(
      'This cost changed while you were looking at it. Check it again before keeping it outside.',
    );
    // A split cost, a cost of another trip, a missing cost, something that is not a fingerprint.
    await expect(keepOutside(db, 'lapland', { kind: 'expense', id: t.museum }, await seen(db, t.museum))).rejects.toThrow(
      'This cost is split now, so it is part of the balances.',
    );
    await expect(keepOutside(db, 'milan', { kind: 'expense', id: t.taxi }, await seen(db, t.taxi))).rejects.toThrow(
      'That cost is not here any more.',
    );
    await expect(keepOutside(db, 'lapland', { kind: 'booking', id: t.taxi }, await seen(db, t.taxi))).rejects.toThrow(
      'That cost is not here any more.',
    );
    await expect(keepOutside(db, 'lapland', { kind: 'expense', id: t.taxi }, 42 as never)).rejects.toThrow(MoneyRuleError);
    // A cancelled booking waiting for its refund is not left out as unsplit: nothing to confirm.
    await setTripItemStatus(db, t.hotel, 'cancelled');
    const cancelled = snapshot(raw);
    await expect(keepOutside(db, 'lapland', { kind: 'booking', id: t.hotel }, await seen(db, t.hotel))).rejects.toThrow(
      'This cost is not one the balances leave out as not split.',
    );
    expect(snapshot(raw)).toEqual(cancelled);
    expect(before.unsplit_confirmations).toEqual([]);
    expect(confirmations(raw)).toEqual([]);
  });

  it('15: the child rules hold with costs kept outside', async () => {
    const { db } = setup();
    const t = await settledTrip(db);
    await removeSplit(db, { expenseId: t.taxi });
    await keep(db, 'expense', t.taxi);
    await expect(createSettlement(db, 'lapland', settlement(t.ana, t.mia, 100))).rejects.toThrow(/Mia would owe money/);
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
