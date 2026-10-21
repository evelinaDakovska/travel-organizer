/**
 * Money records linked to bookings (3D-1, `docs/phase3d1-plan.md`). Three records, never confused:
 *
 * - a **standalone expense** — spending of its own (`expenses`, no booking);
 * - a **payment against a booking** — a deposit, the balance, the whole price
 *   (`booking_payments`); never spending, never a cost;
 * - a **linked expense** — an expense the person said pays for a booking; counts exactly like a
 *   payment, never as spending.
 *
 * A booking's cost is its price, once. Nothing here converts currencies, invents a payer or an
 * amount, or writes the *Paid* switch.
 */

import { z } from 'zod';

import { countsAsSpent, isFullyPaid, paidOf } from './bookingCosts';
import { formatMoney } from './format';
import type { TripItem } from './tripItem';

/** A write refused by a money rule; `message` is the explanation the screen shows. */
export class MoneyRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyRuleError';
  }
}

export type BookingPayment = {
  id: string;
  tripId: string;
  tripItemId: string;
  /** Null: not recorded. */
  payerId: string | null;
  /** Minor units, always positive, in the booking's currency. */
  amount: number;
  currency: string;
  /** Local date, YYYY-MM-DD; null when nobody said. */
  paidOn: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingPaymentRow = {
  id: string;
  trip_id: string;
  trip_item_id: string;
  payer_id: string | null;
  amount: number;
  currency: string;
  paid_on: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export function parseBookingPaymentRow(row: BookingPaymentRow): BookingPayment {
  return {
    id: row.id,
    tripId: row.trip_id,
    tripItemId: row.trip_item_id,
    payerId: row.payer_id,
    amount: row.amount,
    currency: row.currency,
    paidOn: row.paid_on,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The currency is not in the form: a payment always takes its booking's (L-3). */
export const bookingPaymentInputSchema = z.object({
  amount: z
    .number({
      error: (issue) => (issue.input === undefined ? 'Enter the amount' : 'Enter an amount like 12.50'),
    })
    .int()
    .positive('Enter an amount above zero'),
  payerId: z.string().min(1).nullable(),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
    .nullable(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type BookingPaymentInput = z.output<typeof bookingPaymentInputSchema>;
export type BookingPaymentFormValues = z.input<typeof bookingPaymentInputSchema>;

type Booking = Pick<TripItem, 'title' | 'status' | 'priceAmount' | 'priceCurrency'>;

/**
 * Why a payment or a linked expense cannot be recorded against this booking, or null when it can.
 * An idea is a budget, not money paid; without a price there is no cost for it to pay; another
 * currency would need a conversion the app never makes (L-3).
 */
export function recordRefusal(booking: Booking, currency?: string): string | null {
  if (booking.status === 'idea') {
    return 'A saved place has no payments. Book it first, then record what was paid.';
  }
  if (booking.priceAmount === null || booking.priceAmount <= 0 || booking.priceCurrency === null) {
    return `Add the price of “${booking.title}” first — a payment pays towards it.`;
  }
  if (currency !== undefined && currency !== booking.priceCurrency) {
    return `“${booking.title}” is in ${booking.priceCurrency}; this is in ${currency}. A payment must be in the booking’s currency — currencies are never converted.`;
  }
  return null;
}

export type MoneyRecords = { payments: number; linkedExpenses: number };

export const hasRecords = (records: MoneyRecords) =>
  records.payments > 0 || records.linkedExpenses > 0;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 payments and 1 linked expense". */
export function recordsText(records: MoneyRecords): string {
  const parts = [
    records.payments > 0 ? count(records.payments, 'payment', 'payments') : null,
    records.linkedExpenses > 0
      ? count(records.linkedExpenses, 'linked expense', 'linked expenses')
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join(' and ');
}

/**
 * Why a booking cannot be deleted, or null (L-1): its money history would go with it. Cancelling
 * keeps the booking and its records; removing the records one by one is the other way.
 */
export function deleteRefusal(title: string, records: MoneyRecords): string | null {
  if (!hasRecords(records)) return null;
  return `“${title}” has ${recordsText(records)}. To keep the money history, cancel the booking instead, or remove those records first.`;
}

/**
 * Why someone cannot leave a trip, or null (invariant I): what they paid on it would point at
 * nobody. 3D-2 designs the full resolution; until then the payer is changed by hand first.
 */
export function leaveRefusal(name: string, payerRecords: number): string | null {
  if (payerRecords === 0) return null;
  return `${name} is the payer on ${count(payerRecords, 'money record', 'money records')} on this trip. Change the payer on ${payerRecords === 1 ? 'it' : 'those'} first — money history is never moved or deleted by itself.`;
}

type SavedBooking = Pick<TripItem, 'status' | 'priceAmount' | 'priceCurrency'>;
type EditedBooking = {
  status: TripItem['status'];
  priceAmount?: number | null;
  priceCurrency?: string | null;
};

/**
 * An edit that would strand a booking's money records, refused with the reason, or null. While
 * records exist the price stays, in its currency, and the booking stays a booking (cancelling is
 * allowed: it keeps them). L-1, L-3 and `docs/phase3d1-plan.md` §5.
 */
export function editRefusal(
  saved: SavedBooking,
  next: EditedBooking,
  records: MoneyRecords,
): string | null {
  if (!hasRecords(records)) return null;
  const what = recordsText(records);
  const price = next.priceAmount ?? null;
  if (next.status === 'idea') {
    return `This booking has ${what}. A saved place has no payments, so it stays a booking — cancel it instead, or remove those records first.`;
  }
  if (price === null || price <= 0) {
    return `This booking has ${what}, so it keeps a price. Remove those records first to clear it.`;
  }
  if (saved.priceCurrency !== null && (next.priceCurrency ?? null) !== saved.priceCurrency) {
    return `This booking has ${what} in ${saved.priceCurrency}, so its price stays in ${saved.priceCurrency}. Currencies are never converted.`;
  }
  return null;
}

/** A warning, not a refusal: a price below what is recorded leaves the booking overpaid. */
export function overpaidWarning(recorded: number, nextPrice: number | null | undefined, currency: string): string | null {
  if (nextPrice === null || nextPrice === undefined || recorded <= nextPrice) return null;
  return `${formatMoney(recorded, currency)} is recorded as paid, more than this price. The booking will show ${formatMoney(recorded - nextPrice, currency)} overpaid.`;
}

/** Bookings an expense in this currency could pay for: they cost money, in the same currency. */
export function linkableBookings<T extends Pick<TripItem, 'status' | 'priceAmount' | 'priceCurrency' | 'kind'>>(
  items: readonly T[],
  currency: string,
): T[] {
  return items.filter(
    (item) =>
      item.status !== 'idea' &&
      item.priceAmount !== null &&
      item.priceAmount > 0 &&
      item.priceCurrency === currency,
  );
}

type Candidate = Pick<
  TripItem,
  'id' | 'title' | 'status' | 'priceAmount' | 'priceCurrency' | 'isPaid' | 'details' | 'recordedPaid'
>;

/**
 * Bookings a standalone expense may duplicate (§15 *10*): same currency, and the amount is the
 * booking's price or what is left to pay on it. A warning to offer a link, never a merge. A
 * booking already marked *Paid* is included — logging it again as spending is exactly the double
 * count this catches.
 */
export function possibleDuplicates<T extends Candidate>(
  expense: { amount: number; currency: string },
  bookings: readonly T[],
): T[] {
  return bookings.filter((booking) => {
    if (!countsAsSpent(booking) || booking.priceCurrency !== expense.currency) return false;
    const left = booking.priceAmount! - paidOf(booking);
    return (
      expense.amount === booking.priceAmount ||
      (!isFullyPaid(booking) && left > 0 && expense.amount === left)
    );
  });
}

/** What the amount of a new payment starts as: what is left to pay, else nothing typed. */
export function suggestedAmount(booking: Pick<TripItem, 'priceAmount' | 'priceCurrency' | 'isPaid' | 'recordedPaid'>): number | undefined {
  const left = (booking.priceAmount ?? 0) - paidOf(booking);
  return left > 0 ? left : undefined;
}
