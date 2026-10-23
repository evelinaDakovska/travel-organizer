/**
 * The trip's records, shaped for `convertTripTotal` (Phase 4). Kept apart from `conversion.ts` so
 * the arithmetic imports nothing about bookings or spending.
 */

import { countsAsSpent } from './bookingCosts';
import type { BookingPayment } from './bookingPayments';
import type { BookingCost, SpendingCost } from './conversion';
import { isStandalone, type Expense } from './spending';
import type { TripItem } from './tripItem';

type Item = Pick<TripItem, 'id' | 'status' | 'priceAmount' | 'priceCurrency' | 'isPaid' | 'details'>;

/**
 * Bookings as the trip total counts them (`countsAsSpent`), each with the payments and linked
 * expenses towards it; standalone expenses as spending. The same split as `tripTotals`, so the
 * converted figure and the per-currency lines always describe the same money.
 */
export function conversionCosts(
  items: readonly Item[],
  expenses: readonly Pick<Expense, 'amount' | 'currency' | 'charged' | 'tripItemId'>[],
  payments: readonly Pick<BookingPayment, 'amount' | 'charged' | 'tripItemId'>[],
): { bookings: BookingCost[]; spending: SpendingCost[] } {
  const records = new Map<string, { amount: number; charged: BookingCost['records'][number]['charged'] }[]>();
  const add = (itemId: string, amount: number, charged: SpendingCost['charged']) =>
    records.set(itemId, [...(records.get(itemId) ?? []), { amount, charged }]);
  for (const payment of payments) add(payment.tripItemId, payment.amount, payment.charged);
  for (const expense of expenses) if (expense.tripItemId) add(expense.tripItemId, expense.amount, expense.charged);

  return {
    bookings: items.filter(countsAsSpent).map((item) => ({
      currency: item.priceCurrency!,
      price: item.priceAmount!,
      records: records.get(item.id) ?? [],
    })),
    spending: expenses
      .filter(isStandalone)
      .map((expense) => ({ currency: expense.currency, amount: expense.amount, charged: expense.charged })),
  };
}

/**
 * The trip's currencies other than `base`, with what each covers in its own currency (bookings
 * counted plus standalone spending), largest first: the rows of the rates screen.
 */
export function currenciesToConvert(
  costs: { bookings: readonly BookingCost[]; spending: readonly SpendingCost[] },
  base: string | null,
): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const { currency, price } of costs.bookings) totals.set(currency, (totals.get(currency) ?? 0) + price);
  for (const { currency, amount } of costs.spending) totals.set(currency, (totals.get(currency) ?? 0) + amount);
  return [...totals.entries()]
    .filter(([currency]) => currency !== base)
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}
