/**
 * What a trip costs (U6). Money stays in minor units and in its own currency: the app converts
 * nothing (CLAUDE.md §7), so a trip paid in EUR and BGN has two totals.
 */

import type { TripItem } from './tripItem';

type Details = Record<string, unknown> | null | undefined;

/** `details.refundable`: true, false, or null when nobody said — absent on every older item. */
export function refundableOf(details: Details): boolean | null {
  const value = details?.refundable;
  return typeof value === 'boolean' ? value : null;
}

/** Null removes the key, and undefined comes back when nothing else is left. */
export function withRefundable(
  details: Details,
  refundable: boolean | null,
): Record<string, unknown> | undefined {
  const { refundable: _previous, ...rest } = details ?? {};
  const next = refundable === null ? rest : { ...rest, refundable };
  return Object.keys(next).length > 0 ? next : undefined;
}

type Priced = Pick<TripItem, 'status' | 'priceAmount' | 'priceCurrency' | 'isPaid' | 'details'>;

/**
 * Money the trip really costs: everything booked, and a cancellation that cannot be refunded.
 * Ideas are not spent yet; a refundable or unspecified cancellation is assumed to come back.
 */
export function countsAsSpent(item: Priced): boolean {
  if (item.priceAmount === null || item.priceCurrency === null) return false;
  if (item.status === 'confirmed') return true;
  return item.status === 'cancelled' && refundableOf(item.details) === false;
}

export type CurrencyTotal = {
  currency: string;
  /** Minor units. `total` = `paid` + `toPay`. */
  total: number;
  paid: number;
  toPay: number;
  /** The part of `total` lost to non-refundable cancellations. */
  lost: number;
  items: number;
};

/** One line per currency, the largest first. Empty when nothing has a price. */
export function tripExpenses(items: readonly Priced[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const item of items) {
    if (!countsAsSpent(item)) continue;
    const currency = item.priceCurrency!;
    const amount = item.priceAmount!;
    const line = byCurrency.get(currency) ?? {
      currency,
      total: 0,
      paid: 0,
      toPay: 0,
      lost: 0,
      items: 0,
    };
    line.total += amount;
    if (item.isPaid) line.paid += amount;
    else line.toPay += amount;
    if (item.status === 'cancelled') line.lost += amount;
    line.items += 1;
    byCurrency.set(currency, line);
  }

  return [...byCurrency.values()].sort(
    (a, b) => b.total - a.total || a.currency.localeCompare(b.currency),
  );
}
