import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_ITEM_MONEY_RECORDS,
  COUNT_PAYER_RECORDS,
  DELETE_BOOKING_PAYMENT,
  INSERT_BOOKING_PAYMENT,
  SELECT_BOOKING_PAYMENT,
  SELECT_EXPENSE,
  SELECT_ITEM_PAYMENTS,
  SELECT_LAST_PAYER,
  SELECT_LINKED_EXPENSES,
  SELECT_TRIP_MEMBER,
  UNLINK_EXPENSE,
  UPDATE_BOOKING_PAYMENT,
} from '../db/queries';
import {
  bookingPaymentInputSchema,
  MoneyRuleError,
  parseBookingPaymentRow,
  recordRefusal,
  type BookingPayment,
  type BookingPaymentInput,
  type BookingPaymentRow,
  type MoneyRecords,
} from '../domain/bookingPayments';
import { parseExpenseRow, type Expense, type ExpenseRow } from '../domain/spending';
import { afterMoneyWrite, moneyBefore, type MoneyWriteOptions } from './moneyWrites';
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

/**
 * A payer is someone on the record's trip (invariant P); null — not recorded — always passes, and
 * nobody is chosen for the person. The payer a record already names is accepted unchanged, so a
 * record restored as it was is never locked against editing its note.
 */
export async function checkPayer(
  db: SQLiteDatabase,
  tripId: string,
  payerId: string | null,
  current: string | null = null,
): Promise<void> {
  if (payerId === null || payerId === current) return;
  const member = await db.getFirstAsync(SELECT_TRIP_MEMBER, { $tripId: tripId, $travellerId: payerId });
  if (!member) {
    throw new MoneyRuleError(
      'Whoever paid must be on this trip. Add them to the trip first, or leave the payer as not recorded.',
    );
  }
}

/** The form's own schema, again at the boundary: a whole, positive amount, a date or none. */
function validInput(input: BookingPaymentInput): BookingPaymentInput {
  const result = bookingPaymentInputSchema.safeParse(input);
  if (!result.success) throw new MoneyRuleError(result.error.issues[0]?.message ?? 'Check the payment.');
  return result.data;
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
  const valid = validInput(input);
  await db.withTransactionAsync(async () => {
    const item = await getTripItem(db, itemId);
    if (!item) throw new MoneyRuleError('That booking is not here any more.');
    const booking = await bookingForRecord(db, itemId, item.tripId);
    await checkPayer(db, booking.tripId, valid.payerId);
    const before = await moneyBefore(db, booking.tripId);
    await db.runAsync(INSERT_BOOKING_PAYMENT, {
      $id: id,
      $tripId: booking.tripId,
      $itemId: itemId,
      $currency: booking.priceCurrency!,
      ...bindings(valid),
    });
    await afterMoneyWrite(db, booking.tripId, before);
  });
  return id;
}

/**
 * Amount, payer, date and note only: the payment stays on its booking, trip and currency. The same
 * checks as recording one, inside the write's transaction; a refusal changes nothing.
 */
export async function updateBookingPayment(
  db: SQLiteDatabase,
  id: string,
  input: BookingPaymentInput,
): Promise<void> {
  const valid = validInput(input);
  await db.withTransactionAsync(async () => {
    const payment = await getBookingPayment(db, id);
    if (!payment) throw new MoneyRuleError('That payment is not here any more.');
    await bookingForRecord(db, payment.tripItemId, payment.tripId, payment.currency);
    await checkPayer(db, payment.tripId, valid.payerId, payment.payerId);
    const before = await moneyBefore(db, payment.tripId);
    await db.runAsync(UPDATE_BOOKING_PAYMENT, { $id: id, ...bindings(valid) });
    await afterMoneyWrite(db, payment.tripId, before);
  });
}

/**
 * The person's own record, removed only when they say so. Never turned into an expense. The last
 * payment of a refunded cancellation takes it out of the balances: `acceptSettlementReview` (§15).
 */
export async function deleteBookingPayment(
  db: SQLiteDatabase,
  id: string,
  options: MoneyWriteOptions = {},
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const payment = await getBookingPayment(db, id);
    const before = payment ? await moneyBefore(db, payment.tripId) : null;
    await db.runAsync(DELETE_BOOKING_PAYMENT, { $id: id });
    if (payment) await afterMoneyWrite(db, payment.tripId, before, options);
  });
}

/** Makes a linked expense standalone spending again (L-2): explicit, never automatic. */
export async function unlinkExpense(
  db: SQLiteDatabase,
  expenseId: string,
  options: MoneyWriteOptions = {},
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<ExpenseRow>(SELECT_EXPENSE, { $id: expenseId });
    const before = row ? await moneyBefore(db, row.trip_id) : null;
    await db.runAsync(UNLINK_EXPENSE, { $id: expenseId, $now: new Date().toISOString() });
    if (row) await afterMoneyWrite(db, row.trip_id, before, options);
  });
}
