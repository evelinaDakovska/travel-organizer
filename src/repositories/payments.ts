import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_ITEM_MONEY_RECORDS,
  COUNT_PAYER_RECORDS,
  DELETE_BOOKING_PAYMENT,
  INSERT_BOOKING_PAYMENT,
  SELECT_BOOKING_PAYMENT,
  SELECT_ITEM_PAYMENTS,
  SELECT_LAST_PAYER,
  SELECT_LINKED_EXPENSES,
  UNLINK_EXPENSE,
  UPDATE_BOOKING_PAYMENT,
} from '../db/queries';
import {
  MoneyRuleError,
  parseBookingPaymentRow,
  recordRefusal,
  type BookingPayment,
  type BookingPaymentInput,
  type BookingPaymentRow,
  type MoneyRecords,
} from '../domain/bookingPayments';
import { parseExpenseRow, type Expense, type ExpenseRow } from '../domain/spending';
import { getTripItem } from './tripItems';

/**
 * Payments against bookings and expenses linked to them (3D-1). Every rule the screens explain
 * is checked again here, inside the write's transaction, so no caller can record money the rules
 * refuse; the database's NO ACTION references stop a booking's deletion as the last word.
 */

/** Paid state is derived from both tables, and the booking row carries the sum. */
export const PAYMENT_TABLES = ['booking_payments', 'expenses', 'trip_items'] as const;

export async function listItemPayments(db: SQLiteDatabase, itemId: string): Promise<BookingPayment[]> {
  const rows = await db.getAllAsync<BookingPaymentRow>(SELECT_ITEM_PAYMENTS, { $itemId: itemId });
  return rows.map(parseBookingPaymentRow);
}

export async function listLinkedExpenses(db: SQLiteDatabase, itemId: string): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(SELECT_LINKED_EXPENSES, { $itemId: itemId });
  return rows.map(parseExpenseRow);
}

export async function getBookingPayment(db: SQLiteDatabase, id: string): Promise<BookingPayment | null> {
  const row = await db.getFirstAsync<BookingPaymentRow>(SELECT_BOOKING_PAYMENT, { $id: id });
  return row ? parseBookingPaymentRow(row) : null;
}

export async function countMoneyRecords(db: SQLiteDatabase, itemId: string): Promise<MoneyRecords> {
  const row = await db.getFirstAsync<MoneyRecords>(COUNT_ITEM_MONEY_RECORDS, { $itemId: itemId });
  return { payments: row?.payments ?? 0, linkedExpenses: row?.linkedExpenses ?? 0 };
}

/** The payer last recorded on this trip, or null. A suggestion only. */
export async function lastPayerId(db: SQLiteDatabase, tripId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ payer_id: string }>(SELECT_LAST_PAYER, { $tripId: tripId });
  return row?.payer_id ?? null;
}

/** How many money records name this traveller as the payer on this trip. */
export async function countPayerRecords(
  db: SQLiteDatabase,
  tripId: string,
  travellerId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(COUNT_PAYER_RECORDS, {
    $tripId: tripId,
    $travellerId: travellerId,
  });
  return row?.n ?? 0;
}

/** The booking's own checks, read inside the caller's transaction. */
export async function bookingForRecord(
  db: SQLiteDatabase,
  itemId: string,
  tripId: string,
  currency?: string,
) {
  const booking = await getTripItem(db, itemId);
  if (!booking || booking.tripId !== tripId) throw new MoneyRuleError('That booking is not on this trip.');
  const refusal = recordRefusal(booking, currency);
  if (refusal) throw new MoneyRuleError(refusal);
  return booking;
}

const bindings = (input: BookingPaymentInput) => ({
  $payerId: input.payerId,
  $amount: input.amount,
  $paidOn: input.paidOn,
  $note: input.note ?? null,
  $now: new Date().toISOString(),
});

/** In the booking's currency, always: the form has no currency of its own (L-3). */
export async function createBookingPayment(
  db: SQLiteDatabase,
  itemId: string,
  input: BookingPaymentInput,
): Promise<string> {
  const id = randomUUID();
  await db.withTransactionAsync(async () => {
    const item = await getTripItem(db, itemId);
    if (!item) throw new MoneyRuleError('That booking is not here any more.');
    const booking = await bookingForRecord(db, itemId, item.tripId);
    await db.runAsync(INSERT_BOOKING_PAYMENT, {
      $id: id,
      $tripId: booking.tripId,
      $itemId: itemId,
      $currency: booking.priceCurrency!,
      ...bindings(input),
    });
  });
  return id;
}

export async function updateBookingPayment(
  db: SQLiteDatabase,
  id: string,
  input: BookingPaymentInput,
): Promise<void> {
  await db.runAsync(UPDATE_BOOKING_PAYMENT, { $id: id, ...bindings(input) });
}

/** The person's own record, removed only when they say so. Never turned into an expense. */
export async function deleteBookingPayment(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(DELETE_BOOKING_PAYMENT, { $id: id });
}

/** Makes a linked expense standalone spending again (L-2): explicit, never automatic. */
export async function unlinkExpense(db: SQLiteDatabase, expenseId: string): Promise<void> {
  await db.runAsync(UNLINK_EXPENSE, { $id: expenseId, $now: new Date().toISOString() });
}
