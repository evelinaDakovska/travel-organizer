import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_UNSPLIT_CONFIRMATION,
  SELECT_EXPENSES_FOR_TRIP,
  SELECT_TRIP_BOOKING_PAYMENTS,
  SELECT_TRIP_ITEMS,
  SELECT_TRIP_SHARES,
  SELECT_TRIP_UNSPLIT_CONFIRMATIONS,
} from '../db/queries';
import {
  balanceCosts,
  costFingerprint,
  parseUnsplitConfirmationRow,
  type UnsplitConfirmationRow,
} from '../domain/balances';
import { parseBookingPaymentRow, type BookingPaymentRow } from '../domain/bookingPayments';
import { parseCostShareRow, type CostShareRow } from '../domain/costShares';
import { parseExpenseRow, type ExpenseRow } from '../domain/spending';
import { parseTripItemRow, type TripItemRow } from '../domain/tripItem';

/**
 * Ends every confirmation on the trip that its cost no longer reads as (review follow-up, plan
 * §14.4). Each write that can change a cost's money — a booking's price, currency, status or
 * *Paid*, a payment, an expense — calls this inside its own transaction, after writing: a stored
 * confirmation then always matches its cost, so a change undone later never brings one back, and a
 * refused write rolls back with it. A rename, a note or a date leaves the fingerprint, and the
 * confirmation, as they were. Splits are ended by migration 010's triggers, not here.
 *
 * Reads the rows itself rather than through the other repositories, which call it.
 */
export async function endChangedConfirmations(db: SQLiteDatabase, tripId: string): Promise<void> {
  const rows = await db.getAllAsync<UnsplitConfirmationRow>(SELECT_TRIP_UNSPLIT_CONFIRMATIONS, { $tripId: tripId });
  if (rows.length === 0) return;
  const [items, expenses, payments, shares] = await Promise.all([
    db.getAllAsync<TripItemRow & { trip_default_tz: string }>(SELECT_TRIP_ITEMS, { $tripId: tripId }),
    db.getAllAsync<ExpenseRow>(SELECT_EXPENSES_FOR_TRIP, { $tripId: tripId }),
    db.getAllAsync<BookingPaymentRow>(SELECT_TRIP_BOOKING_PAYMENTS, { $tripId: tripId }),
    db.getAllAsync<CostShareRow>(SELECT_TRIP_SHARES, { $tripId: tripId }),
  ]);
  const costs = balanceCosts({
    items: items.map((row) => parseTripItemRow(row, row.trip_default_tz)),
    expenses: expenses.map(parseExpenseRow),
    payments: payments.map(parseBookingPaymentRow),
    shares: shares.map(parseCostShareRow),
  });
  for (const confirmation of rows.map(parseUnsplitConfirmationRow)) {
    const cost = costs.find((c) => c.kind === confirmation.costKind && c.id === confirmation.costId);
    if (cost && costFingerprint(cost) === confirmation.fingerprint) continue;
    await db.runAsync(DELETE_UNSPLIT_CONFIRMATION, {
      $itemId: confirmation.costKind === 'booking' ? confirmation.costId : null,
      $expenseId: confirmation.costKind === 'expense' ? confirmation.costId : null,
    });
  }
}
