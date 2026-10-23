import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_TRIP_SETTLEMENTS,
  DELETE_UNSPLIT_CONFIRMATION,
  INSERT_SETTLEMENT_REVIEW,
  SELECT_EXPENSES_FOR_TRIP,
  SELECT_OPEN_SETTLEMENT_REVIEWS,
  SELECT_TRIP_BOOKING_PAYMENTS,
  SELECT_TRIP_COVER,
  SELECT_TRIP_ITEMS,
  SELECT_TRIP_SETTLEMENTS,
  SELECT_TRIP_SHARES,
  SELECT_TRIP_TRAVELLERS,
  SELECT_TRIP_UNSPLIT_CONFIRMATIONS,
} from '../db/queries';
import {
  balanceCosts,
  costFingerprint,
  costsLeavingSettledCurrencies,
  parseSettlementReviewRow,
  parseSettlementRow,
  parseUnsplitConfirmationRow,
  SettlementReviewNeeded,
  type BalanceInput,
  type CostFate,
  type SettlementReviewRow,
  type SettlementRow,
  type UnsplitConfirmationRow,
} from '../domain/balances';
import { parseBookingPaymentRow, type BookingPaymentRow } from '../domain/bookingPayments';
import { parseCostShareRow, type CostShareRow } from '../domain/costShares';
import { parseExpenseRow, type ExpenseRow } from '../domain/spending';
import { parseTravellerRow, type TravellerRow } from '../domain/traveller';
import { parseTripItemRow, type TripItemRow } from '../domain/tripItem';

/**
 * What every write that can change a cost's money does around itself (plan §14.4, §15): read the
 * trip's balances before, and after writing — still inside the write's transaction — end the
 * confirmations its costs no longer match, and record a settlement review for each shared cost that
 * left a currency with settlements, or refuse until the person has been told. A refusal rolls the
 * whole write back.
 *
 * Reads the rows itself rather than through the other repositories, which call it.
 */

type TripMoney = {
  input: BalanceInput;
  fate: (kind: 'booking' | 'expense', id: string) => CostFate;
};

async function readTripMoney(db: SQLiteDatabase, tripId: string): Promise<TripMoney> {
  const $tripId = { $tripId: tripId };
  const [members, cover, items, expenses, payments, shares, settlements, confirmations, reviews] = await Promise.all([
    db.getAllAsync<TravellerRow>(SELECT_TRIP_TRAVELLERS, $tripId),
    db.getAllAsync<{ child_id: string; adult_id: string; sort_order: number }>(SELECT_TRIP_COVER, $tripId),
    db.getAllAsync<TripItemRow & { trip_default_tz: string }>(SELECT_TRIP_ITEMS, $tripId),
    db.getAllAsync<ExpenseRow>(SELECT_EXPENSES_FOR_TRIP, $tripId),
    db.getAllAsync<BookingPaymentRow>(SELECT_TRIP_BOOKING_PAYMENTS, $tripId),
    db.getAllAsync<CostShareRow>(SELECT_TRIP_SHARES, $tripId),
    db.getAllAsync<SettlementRow>(SELECT_TRIP_SETTLEMENTS, $tripId),
    db.getAllAsync<UnsplitConfirmationRow>(SELECT_TRIP_UNSPLIT_CONFIRMATIONS, $tripId),
    db.getAllAsync<SettlementReviewRow>(SELECT_OPEN_SETTLEMENT_REVIEWS, $tripId),
  ]);
  const parsedExpenses = expenses.map(parseExpenseRow);
  return {
    input: {
      members: members.map(parseTravellerRow),
      tripCover: cover.map((row) => ({ childId: row.child_id, adultId: row.adult_id, sortOrder: row.sort_order })),
      costs: balanceCosts({
        items: items.map((row) => parseTripItemRow(row, row.trip_default_tz)),
        expenses: parsedExpenses,
        payments: payments.map(parseBookingPaymentRow),
        shares: shares.map(parseCostShareRow),
      }),
      settlements: settlements.map(parseSettlementRow),
      confirmations: confirmations.map(parseUnsplitConfirmationRow),
      settlementReviews: reviews.map(parseSettlementReviewRow),
    },
    fate: (kind, id) => {
      if (kind === 'booking') return items.some((row) => row.id === id) ? 'exists' : 'deleted';
      const expense = parsedExpenses.find((one) => one.id === id);
      return !expense ? 'deleted' : expense.tripItemId !== null ? 'linked' : 'exists';
    },
  };
}

/** Every record a trip's balances are worked out from, read as it is now. */
export async function balanceInput(db: SQLiteDatabase, tripId: string): Promise<BalanceInput> {
  return (await readTripMoney(db, tripId)).input;
}

/**
 * Ends every confirmation on the trip that its cost no longer reads as (§14.4): a stored
 * confirmation always matches its cost, so a change undone later never brings one back. A rename, a
 * note or a date leaves the fingerprint, and the confirmation, as they were. Splits are ended by
 * migration 010's triggers, not here.
 */
async function endChangedConfirmations(db: SQLiteDatabase, input: BalanceInput): Promise<void> {
  for (const confirmation of input.confirmations ?? []) {
    const cost = input.costs.find((c) => c.kind === confirmation.costKind && c.id === confirmation.costId);
    if (cost && costFingerprint(cost) === confirmation.fingerprint) continue;
    await db.runAsync(DELETE_UNSPLIT_CONFIRMATION, {
      $itemId: confirmation.costKind === 'booking' ? confirmation.costId : null,
      $expenseId: confirmation.costKind === 'expense' ? confirmation.costId : null,
    });
  }
}

export type MoneyWriteOptions = {
  /** The person was told the currency has settlements and continued (§15.2). */
  acceptSettlementReview?: boolean;
};

/** The trip's balances before a money write, or null when it has no settlement to protect. */
export async function moneyBefore(db: SQLiteDatabase, tripId: string): Promise<BalanceInput | null> {
  const row = await db.getFirstAsync<{ n: number }>(COUNT_TRIP_SETTLEMENTS, { $tripId: tripId });
  return row && row.n > 0 ? balanceInput(db, tripId) : null;
}

/**
 * Last, inside the write's transaction. A shared cost that left a currency with settlements records
 * one open review per cost — or, unless the person continued, refuses with `SettlementReviewNeeded`
 * and the write rolls back (§15.1–15.3).
 */
export async function afterMoneyWrite(
  db: SQLiteDatabase,
  tripId: string,
  before: BalanceInput | null,
  options: MoneyWriteOptions = {},
): Promise<void> {
  const after = await readTripMoney(db, tripId);
  await endChangedConfirmations(db, after.input);
  if (!before) return;
  const left = costsLeavingSettledCurrencies(before, after.input, after.fate);
  if (left.length === 0) return;
  if (!options.acceptSettlementReview) throw new SettlementReviewNeeded(left);
  const now = new Date().toISOString();
  for (const one of left) {
    await db.runAsync(INSERT_SETTLEMENT_REVIEW, {
      $id: randomUUID(),
      $tripId: tripId,
      $currency: one.currency,
      $reason: one.reason,
      $costKind: one.costKind,
      $costTitle: one.costTitle,
      $costAmount: one.costAmount,
      $toCurrency: one.toCurrency,
      $now: now,
    });
  }
}
