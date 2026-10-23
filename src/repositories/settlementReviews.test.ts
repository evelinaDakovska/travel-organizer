import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import {
  balancesHeading,
  settleUpText,
  SettlementReviewNeeded,
  statusText,
  tripBalances,
  type BalanceInput,
} from '../domain/balances';
import { MoneyRuleError } from '../domain/bookingPayments';
import { buildExportDocument, planImport } from '../domain/export';
import { tripItemInputSchema } from '../domain/tripItem';
import { applyImport, readTables } from './backup';
import { removeSplit, saveSplit } from './costShares';
import { createExpense, deleteExpense, updateExpense } from './expenses';
import { createBookingPayment, deleteBookingPayment } from './payments';
import { balanceInput, createSettlement, keepOutside, settlementsStillStand } from './settlements';
import { createTripTraveller } from './travellers';
import { createTripItem, deleteTripItem, setTripItemStatus, updateTripItem } from './tripItems';
import { deleteTrip } from './trips';
import { costFingerprint } from '../domain/balances';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Settlement review holds (plan §15) through the real repositories over better-sqlite3: a shared
 * cost leaving a currency with settlements asks first, then holds that currency's suggestions until
 * someone says the settlements still stand. No settlement, cost or record is changed by a hold or
 * its acknowledgement; a cancelled or failed write leaves every table as it was.
 */

const now = '2026-10-23T09:00:00.000Z';
const schema = tripItemInputSchema('Europe/Helsinki');
const plan = (title: string, extra: Record<string, unknown> = {}) =>
  schema.parse({ kind: 'stay', status: 'confirmed', title, ...extra });
const accept = { acceptSettlementReview: true };

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

const TABLES = [
  'trips', 'trip_items', 'travellers', 'trip_travellers', 'booking_payments', 'expenses', 'cost_shares',
  'trip_cover', 'settlements', 'unsplit_confirmations', 'settlement_reviews', 'payments', 'resources',
];
function snapshot(raw: Database.Database) {
  return Object.fromEntries(TABLES.map((table) => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
const rows = (raw: Database.Database, table: string) => raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const reviews = (raw: Database.Database) =>
  raw
    .prepare(
      `SELECT trip_id, currency, reason, cost_kind, cost_title, cost_amount, to_currency,
              acknowledged_at IS NOT NULL AS acknowledged
         FROM settlement_reviews ORDER BY rowid`,
    )
    .all();
const openIds = (raw: Database.Database, currency = 'EUR') =>
  (
    raw
      .prepare(`SELECT id FROM settlement_reviews WHERE currency = ? AND acknowledged_at IS NULL ORDER BY rowid`)
      .all(currency) as { id: string }[]
  ).map((row) => row.id);

const spend = (amount: number, payerId: string | null, extra: Record<string, unknown> = {}) => ({
  category: 'transport' as const,
  label: 'Taxi',
  amount,
  currency: 'EUR',
  spentOn: '2026-11-21',
  notes: undefined,
  payerId,
  tripItemId: null,
  ...extra,
});
const equal = (...ids: string[]) => ({
  people: ids.map((travellerId) => ({ travellerId, amount: null, coveredBy: null })),
});
const pay = (amount: number, payerId: string | null) => ({ amount, payerId, paidOn: null, note: undefined });
const settlement = (fromId: string, toId: string, amount: number, currency = 'EUR') => ({
  fromId,
  toId,
  amount,
  currency,
  settledOn: '2026-11-24',
  note: undefined,
});
const entryOf = async (db: Db, currency = 'EUR') =>
  tripBalances(await balanceInput(db, 'lapland')).find((entry) => entry.currency === currency)!;
const without = (input: BalanceInput): BalanceInput => ({ ...input, settlementReviews: [] });

/**
 * The owner's example: Ana paid a taxi (30) and a museum (20), both split equally with Ben, who owes
 * 25 and has sent 15. Final: Ben pays Ana 10.
 */
async function example(db: Db) {
  const ana = await createTripTraveller(db, 'lapland', 'Ana', 'adult');
  const ben = await createTripTraveller(db, 'lapland', 'Ben', 'adult');
  const mia = await createTripTraveller(db, 'lapland', 'Mia', 'child');
  const taxi = await createExpense(db, 'lapland', spend(3000, ana));
  const museum = await createExpense(db, 'lapland', spend(2000, ana, { label: 'Museum', category: 'activities' }));
  await saveSplit(db, { expenseId: taxi }, equal(ana, ben));
  await saveSplit(db, { expenseId: museum }, equal(ana, ben));
  await createSettlement(db, 'lapland', settlement(ben, ana, 1500));
  return { ana, ben, mia, taxi, museum };
}

describe('a shared cost leaving a currency with settlements (§15.1)', () => {
  it('1, 8, 10, 11: deleting the taxi asks first — Cancel changes nothing; Continue holds EUR, balances kept', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    expect((await entryOf(db)).transfers).toEqual([{ fromId: ben, toId: ana, amount: 1000 }]);

    // The first attempt is the warning: refused, rolled back, every table as it was.
    const before = snapshot(raw);
    const refused = deleteExpense(db, taxi);
    await expect(refused).rejects.toBeInstanceOf(SettlementReviewNeeded);
    await expect(refused).rejects.toBeInstanceOf(MoneyRuleError);
    await expect(refused).rejects.toThrow(
      'EUR already has recorded settlements. Removing or moving this shared cost may change who owes whom. Existing settlements will stay unchanged',
    );
    expect(snapshot(raw)).toEqual(before);

    // Continued: the delete and one open review for EUR, nothing else.
    await deleteExpense(db, taxi, accept);
    expect(reviews(raw)).toEqual([
      {
        trip_id: 'lapland', currency: 'EUR', reason: 'deleted', cost_kind: 'expense', cost_title: 'Taxi',
        cost_amount: 3000, to_currency: null, acknowledged: 0,
      },
    ]);
    expect(rows(raw, 'settlements')).toEqual(before.settlements);
    expect(rows(raw, 'booking_payments')).toEqual(before.booking_payments);

    // Held: no suggestion, never final, and the nets exactly as the balances work them out.
    const input = await balanceInput(db, 'lapland');
    const held = tripBalances(input).find((entry) => entry.currency === 'EUR')!;
    const unheld = tripBalances(without(input)).find((entry) => entry.currency === 'EUR')!;
    expect(held.state).toBe('review');
    expect(held.heldBecause).toBe('settlementReview');
    expect(held.transfers).toEqual([]);
    expect(unheld.transfers).toEqual([{ fromId: ana, toId: ben, amount: 500 }]);
    expect(held.people).toEqual(unheld.people);
    expect(held.settlements).toEqual(unheld.settlements);
    expect(balancesHeading(held)).toBe('Balances so far · EUR — settlements need review');
    expect(statusText(held)).toBe(
      'Suggested transfers are paused: shared costs in EUR changed after settlements were recorded. Review the settlements and say whether they still stand.',
    );
    expect(statusText(held)).not.toMatch(/settled up/i);
    expect(settleUpText('Lapland', [held], () => 'x')).toContain('EUR: not final — settlements need review');
  });

  it('2–4, 18: moving the taxi to NOK holds EUR only; NOK suggests as usual', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    await expect(updateExpense(db, taxi, spend(3000, ana, { currency: 'NOK' }))).rejects.toBeInstanceOf(
      SettlementReviewNeeded,
    );
    await updateExpense(db, taxi, spend(3000, ana, { currency: 'NOK' }), accept);
    expect(reviews(raw)).toEqual([
      expect.objectContaining({ currency: 'EUR', reason: 'moved', to_currency: 'NOK', cost_title: 'Taxi', acknowledged: 0 }),
    ]);
    expect((await entryOf(db, 'EUR')).heldBecause).toBe('settlementReview');
    const nok = await entryOf(db, 'NOK');
    expect(nok.settlementReviews).toEqual([]);
    expect(nok.transfers).toEqual([{ fromId: ben, toId: ana, amount: 1500 }]);

    // A settlement in NOK later does not hold NOK: nothing left it.
    await createSettlement(db, 'lapland', settlement(ben, ana, 500, 'NOK'));
    expect((await entryOf(db, 'NOK')).heldBecause).toBeNull();
  });

  it('5–7: no hold without settlements, for a new expense, for a rename, or for a new amount in the same currency', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    // NOK has no settlement: a shared NOK cost deleted asks nothing.
    const ferry = await createExpense(db, 'lapland', spend(9000, ana, { label: 'Ferry', currency: 'NOK' }));
    await saveSplit(db, { expenseId: ferry }, equal(ana, ben));
    await deleteExpense(db, ferry);
    // A new, unrelated expense; a rename, notes and date; a new amount, still complete in EUR.
    const dinner = await createExpense(db, 'lapland', spend(4000, ben, { label: 'Dinner', category: 'food' }));
    await saveSplit(db, { expenseId: dinner }, equal(ana, ben));
    await updateExpense(db, taxi, spend(3000, ana, { label: 'Airport taxi', notes: 'card', spentOn: '2026-11-22' }));
    await updateExpense(db, taxi, spend(3600, ana, { label: 'Airport taxi' }));
    expect(reviews(raw)).toEqual([]);
    expect((await entryOf(db)).heldBecause).toBeNull();
  });

  it('a cost that only becomes incomplete or unsplit stays in EUR: held by the existing rules, not by a review', async () => {
    const { raw, db } = setup();
    const { taxi, museum } = await example(db);
    await removeSplit(db, { expenseId: taxi });
    await updateExpense(db, museum, spend(2000, null, { label: 'Museum', category: 'activities' }));
    expect(reviews(raw)).toEqual([]);
    const entry = await entryOf(db);
    expect(entry.state).toBe('soFar');
    expect(entry.toReview.map((cost) => cost.id)).toEqual([taxi]);
  });

  it('closes the two-step ways round: unsplit first, or unpaid first, then deleted — but not a cost kept outside', async () => {
    const { raw, db } = setup();
    const { ana, taxi, museum } = await example(db);
    // Unsplit, to review, then deleted: the review question would go unanswered.
    await removeSplit(db, { expenseId: taxi });
    await deleteExpense(db, taxi, accept);
    // Its payer removed (waiting), then deleted.
    await updateExpense(db, museum, spend(2000, null, { label: 'Museum', category: 'activities' }));
    await deleteExpense(db, museum, accept);
    expect(reviews(raw).map((row) => (row as { cost_title: string }).cost_title)).toEqual(['Taxi', 'Museum']);

    // Kept outside on purpose, then deleted: the person already said it is not part of this.
    const soup = await createExpense(db, 'lapland', spend(1200, ana, { label: 'Soup', category: 'food' }));
    const cost = (await balanceInput(db, 'lapland')).costs.find((one) => one.id === soup)!;
    await keepOutside(db, 'lapland', { kind: 'expense', id: soup }, costFingerprint(cost));
    await deleteExpense(db, soup);
    expect(reviews(raw)).toHaveLength(2);
  });

  it('bookings: deleting, re-pricing in another currency, or cancelling an unpaid split booking — deleted, moved, left', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await example(db);
    const split = async (title: string) => {
      const id = await createTripItem(db, 'lapland', plan(title, { priceAmount: 10000, priceCurrency: 'EUR' }));
      await saveSplit(db, { itemId: id }, equal(ana, ben));
      return id;
    };
    const cabin = await split('Cabin');
    const sauna = await split('Sauna');
    const husky = await split('Husky');
    await expect(deleteTripItem(db, cabin)).rejects.toBeInstanceOf(SettlementReviewNeeded);
    await deleteTripItem(db, cabin, accept);
    await expect(
      updateTripItem(db, sauna, plan('Sauna', { priceAmount: 10000, priceCurrency: 'NOK' })),
    ).rejects.toBeInstanceOf(SettlementReviewNeeded);
    await updateTripItem(db, sauna, plan('Sauna', { priceAmount: 10000, priceCurrency: 'NOK' }), undefined, accept);
    await expect(setTripItemStatus(db, husky, 'cancelled')).rejects.toBeInstanceOf(SettlementReviewNeeded);
    await setTripItemStatus(db, husky, 'cancelled', accept);
    expect(reviews(raw)).toEqual([
      expect.objectContaining({ reason: 'deleted', cost_kind: 'booking', cost_title: 'Cabin', currency: 'EUR' }),
      expect.objectContaining({ reason: 'moved', cost_kind: 'booking', cost_title: 'Sauna', to_currency: 'NOK' }),
      expect.objectContaining({ reason: 'left', cost_kind: 'booking', cost_title: 'Husky', to_currency: null }),
    ]);
  });

  it('a refunded cancellation whose last payment is deleted leaves EUR: asked, then held', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await example(db);
    const hotel = await createTripItem(db, 'lapland', plan('Hotel', { priceAmount: 10000, priceCurrency: 'EUR' }));
    await saveSplit(db, { itemId: hotel }, equal(ana, ben));
    const paid = await createBookingPayment(db, hotel, pay(10000, ana));
    await setTripItemStatus(db, hotel, 'cancelled');
    expect(reviews(raw)).toEqual([]);
    await expect(deleteBookingPayment(db, paid)).rejects.toBeInstanceOf(SettlementReviewNeeded);
    await deleteBookingPayment(db, paid, accept);
    expect(reviews(raw)).toEqual([expect.objectContaining({ reason: 'left', cost_title: 'Hotel' })]);
  });

  it('9: a write that fails after the review is written rolls back both, the cost and the review', async () => {
    const { raw, db } = setup();
    const { taxi } = await example(db);
    raw.exec(`CREATE TEMP TRIGGER fail_review BEFORE INSERT ON settlement_reviews BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
    const before = snapshot(raw);
    await expect(deleteExpense(db, taxi, accept)).rejects.toThrow('disk full');
    expect(snapshot(raw)).toEqual(before);
    // And a refused write never gets that far: an invalid amount, with the currency changed.
    await expect(updateExpense(db, taxi, spend(10.5, null, { currency: 'NOK' }), accept)).rejects.toThrow();
    expect(snapshot(raw)).toEqual(before);
  });
});

describe('reviewing the settlements (§15.3)', () => {
  it('12: Settlements still stand resumes suggestions, and changes nothing but the review', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    await deleteExpense(db, taxi, accept);
    const before = snapshot(raw);
    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    const after = snapshot(raw);
    expect({ ...after, settlement_reviews: [] }).toEqual({ ...before, settlement_reviews: [] });
    expect(reviews(raw)).toEqual([expect.objectContaining({ acknowledged: 1 })]);
    const entry = await entryOf(db);
    expect(entry.state).toBe('final');
    expect(entry.transfers).toEqual([{ fromId: ana, toId: ben, amount: 500 }]);
  });

  it('13: a later change holds again; the earlier acknowledgement does not cover it', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    const dinner = await createExpense(db, 'lapland', spend(4000, ben, { label: 'Dinner', category: 'food' }));
    await saveSplit(db, { expenseId: dinner }, equal(ana, ben));
    await deleteExpense(db, taxi, accept);
    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    await deleteExpense(db, dinner, accept);
    expect(reviews(raw).map((row) => (row as { acknowledged: number }).acknowledged)).toEqual([1, 0]);
    expect((await entryOf(db)).heldBecause).toBe('settlementReview');
  });

  it('14: a stale screen is refused, nothing written; nothing open is refused too', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    const dinner = await createExpense(db, 'lapland', spend(4000, ben, { label: 'Dinner', category: 'food' }));
    await saveSplit(db, { expenseId: dinner }, equal(ana, ben));
    await deleteExpense(db, taxi, accept);
    const seen = openIds(raw);
    // While the review screen is open, another shared cost is deleted.
    await deleteExpense(db, dinner, accept);
    const before = snapshot(raw);
    await expect(settlementsStillStand(db, 'lapland', 'EUR', seen)).rejects.toThrow(
      'Something changed in EUR since you opened this review',
    );
    expect(snapshot(raw)).toEqual(before);
    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    await expect(settlementsStillStand(db, 'lapland', 'EUR', [])).rejects.toThrow('Nothing in EUR is waiting for review');
  });

  it('15: several changes before a review are each kept; acknowledging needs all of them, then clears all', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    const dinner = await createExpense(db, 'lapland', spend(4000, ben, { label: 'Dinner', category: 'food' }));
    await saveSplit(db, { expenseId: dinner }, equal(ana, ben));
    await deleteExpense(db, taxi, accept);
    await updateExpense(db, dinner, spend(4000, ben, { label: 'Dinner', category: 'food', currency: 'NOK' }), accept);
    const [first, second] = openIds(raw);
    expect((await entryOf(db)).settlementReviews.map((review) => review.reason)).toEqual(['deleted', 'moved']);
    await expect(settlementsStillStand(db, 'lapland', 'EUR', [first])).rejects.toThrow('Something changed');
    expect(openIds(raw)).toEqual([first, second]);
    await settlementsStillStand(db, 'lapland', 'EUR', [second, first]);
    expect(openIds(raw)).toEqual([]);
  });

  it('acknowledges one currency only', async () => {
    const { raw, db } = setup();
    const { ana, ben } = await example(db);
    const ferry = await createExpense(db, 'lapland', spend(9000, ana, { label: 'Ferry', currency: 'NOK' }));
    const bus = await createExpense(db, 'lapland', spend(3000, ana, { label: 'Bus', currency: 'NOK' }));
    await saveSplit(db, { expenseId: ferry }, equal(ana, ben));
    await saveSplit(db, { expenseId: bus }, equal(ana, ben));
    await createSettlement(db, 'lapland', settlement(ben, ana, 1000, 'NOK'));
    await deleteExpense(db, ferry, accept);
    const museumAndTaxi = (await balanceInput(db, 'lapland')).costs.filter((cost) => cost.currency === 'EUR');
    await deleteExpense(db, museumAndTaxi[0].id, accept);
    await settlementsStillStand(db, 'lapland', 'NOK', openIds(raw, 'NOK'));
    expect(openIds(raw, 'NOK')).toEqual([]);
    expect(openIds(raw, 'EUR')).toHaveLength(1);
    expect((await entryOf(db, 'NOK')).heldBecause).toBeNull();
    expect((await entryOf(db, 'EUR')).heldBecause).toBe('settlementReview');
  });
});

describe('with the other conditions (§15.4)', () => {
  it('16: an unsplit cost to review and a settlement review both show; clearing one leaves the other', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi, museum } = await example(db);
    const dinner = await createExpense(db, 'lapland', spend(4000, ben, { label: 'Dinner', category: 'food' }));
    await saveSplit(db, { expenseId: dinner }, equal(ana, ben));
    await removeSplit(db, { expenseId: museum });
    await deleteExpense(db, taxi, accept);
    const both = await entryOf(db);
    expect(both.state).toBe('review');
    expect(both.heldBecause).toBe('settlementReview');
    expect(both.toReview.map((cost) => cost.id)).toEqual([museum]);
    expect(balancesHeading(both)).toBe('Balances so far · EUR — settlements need review · 1 unsplit cost to review');
    expect(statusText(both)).toContain('Also, 1 cost is not split');

    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    const unsplitOnly = await entryOf(db);
    expect(unsplitOnly.heldBecause).toBe('review');
    expect(unsplitOnly.transfers).toEqual([]);
    const cost = (await balanceInput(db, 'lapland')).costs.find((one) => one.id === museum)!;
    await keepOutside(db, 'lapland', { kind: 'expense', id: museum }, costFingerprint(cost));
    expect((await entryOf(db)).heldBecause).toBeNull();
  });

  it('17: an incomplete shared cost still reads so far, held or acknowledged; settlements only suggests nothing', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi, museum } = await example(db);
    const hotel = await createTripItem(db, 'lapland', plan('Hotel', { priceAmount: 10000, priceCurrency: 'EUR' }));
    await saveSplit(db, { itemId: hotel }, equal(ana, ben));
    await deleteExpense(db, taxi, accept);
    const held = await entryOf(db);
    expect(held.state).toBe('soFar');
    expect(held.heldBecause).toBe('waiting');
    expect(held.settlementReviews).toHaveLength(1);
    expect(balancesHeading(held)).toBe('Balances so far · EUR — 1 cost not included yet · settlements need review');
    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    expect((await entryOf(db)).state).toBe('soFar');

    // The last complete cost leaves: settlements only, whatever is acknowledged.
    await deleteTripItem(db, hotel, accept);
    await deleteExpense(db, museum, accept);
    const only = await entryOf(db);
    expect(only.state).toBe('settlementsOnly');
    expect(only.transfers).toEqual([]);
    expect(balancesHeading(only)).toBe('Settlements only · EUR — no costs in the balances · settlements need review');
    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    expect((await entryOf(db)).transfers).toEqual([]);
  });

  it('19: the child rules are unchanged while held', async () => {
    const { db } = setup();
    const { ana, mia, taxi } = await example(db);
    await deleteExpense(db, taxi, accept);
    await expect(createSettlement(db, 'lapland', settlement(ana, mia, 500))).rejects.toThrow('A child never owes');
  });

  it('a hold applies only while the currency has a settlement', async () => {
    const { raw, db } = setup();
    const { taxi } = await example(db);
    await deleteExpense(db, taxi, accept);
    const [only] = rows(raw, 'settlements') as { id: string }[];
    raw.prepare(`DELETE FROM settlements WHERE id = ?`).run(only.id);
    expect((await entryOf(db)).settlementReviews).toEqual([]);
    expect(openIds(raw)).toHaveLength(1);
  });
});

describe('kept with the trip (§15.3)', () => {
  it('20: a backup restored elsewhere keeps the hold open; acknowledged ones stay acknowledged', async () => {
    const { raw, db } = setup();
    const { ana, ben, taxi } = await example(db);
    const dinner = await createExpense(db, 'lapland', spend(4000, ben, { label: 'Dinner', category: 'food' }));
    await saveSplit(db, { expenseId: dinner }, equal(ana, ben));
    await deleteExpense(db, taxi, accept);
    await settlementsStillStand(db, 'lapland', 'EUR', openIds(raw));
    await deleteExpense(db, dinner, accept);

    const restoredRaw = new Database(':memory:');
    restoredRaw.pragma('foreign_keys = ON');
    for (const m of MIGRATIONS) restoredRaw.exec(m.sql);
    const restored = asyncDatabase(restoredRaw);
    const document = buildExportDocument(await readTables(db), { exportedAt: now });
    expect(document.tables.settlementReviews).toHaveLength(2);
    await applyImport(restored, planImport(document, [], 'merge', []));
    expect(rows(restoredRaw, 'settlement_reviews')).toEqual(rows(raw, 'settlement_reviews'));
    const entry = tripBalances(await balanceInput(restored, 'lapland')).find((one) => one.currency === 'EUR')!;
    expect(entry.heldBecause).toBe('settlementReview');
    expect(entry.settlementReviews.map((review) => review.costTitle)).toEqual(['Dinner']);
  });

  it('22: deleting the trip deletes its reviews, and no other trip’s', async () => {
    const { raw, db } = setup();
    const { taxi } = await example(db);
    await deleteExpense(db, taxi, accept);
    raw
      .prepare(
        `INSERT INTO settlement_reviews (id, trip_id, currency, reason, cost_kind, cost_title, cost_amount, to_currency, created_at)
         VALUES ('other', 'milan', 'EUR', 'deleted', 'expense', 'Pizza', 1000, NULL, ?)`,
      )
      .run(now);
    await deleteTrip(db, 'lapland');
    expect((raw.prepare(`SELECT id FROM settlement_reviews`).all() as { id: string }[]).map((r) => r.id)).toEqual(['other']);
  });
});
