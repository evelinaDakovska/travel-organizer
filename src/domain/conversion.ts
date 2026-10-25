/**
 * Converting a trip's costs to one reporting currency (Phase 4, `docs/phase4-plan.md` §3).
 *
 * Nothing recorded changes: every amount keeps its own currency, and a conversion is worked out on
 * demand, never stored. A rate is typed in by the person (1 `currency` = `rate` `baseCurrency`) and
 * makes an **estimate**; a record's *charged* amount is what it really cost in the reporting
 * currency and is **locked** — used as it is, never re-estimated. A currency with no rate is left
 * out by name, never guessed or counted as zero.
 *
 * Money is hundredths of a unit for every currency (`parseAmount`). Rates are exact decimal text and
 * the arithmetic is BigInt, so no float ever touches money.
 */

import { z } from 'zod';

import { CURRENCY_CODE, currencyDecimals } from './currencies';
import { formatMoney } from './format';

const RATE_TEXT = /^(\d{1,12})(?:[.,](\d{1,10}))?$/;

/**
 * A rate as typed: a positive decimal, a point or a comma, at most 12 significant digits and 10
 * decimals. Normalised to a point and without needless zeros ('0,9200' → '0.92').
 */
export const rateTextSchema = z
  .string()
  .trim()
  .regex(RATE_TEXT, 'Enter a rate like 0.92')
  .transform((text) => normaliseRate(text))
  .refine((text) => /[1-9]/.test(text), 'A rate must be more than 0')
  .refine((text) => text.replace('.', '').replace(/^0+/, '').length <= 12, 'At most 12 digits');

function normaliseRate(text: string): string {
  const [, whole, fraction = ''] = RATE_TEXT.exec(text)!;
  const units = whole.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals ? `${units}.${decimals}` : units;
}

/** The rate as an exact fraction: numerator over a power of ten. */
function rateFraction(rate: string): { numerator: bigint; denominator: bigint } {
  const [whole, fraction = ''] = rate.split('.');
  return { numerator: BigInt(whole + fraction), denominator: TEN ** BigInt(fraction.length) };
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const HUNDRED = BigInt(100);

/** n / d rounded half away from zero. */
function roundDivide(n: bigint, d: bigint): bigint {
  const negative = n < ZERO !== d < ZERO;
  const a = n < ZERO ? -n : n;
  const b = d < ZERO ? -d : d;
  const q = (TWO * a + b) / (TWO * b);
  return negative ? -q : q;
}

/** Hundredths of `amount` × `numerator` / `denominator`, rounded to what `base` is shown with. */
function scaled(amount: number, numerator: bigint, denominator: bigint, base: string): number {
  // Whole units for a zero-decimal base: round to hundreds of hundredths.
  const step = currencyDecimals(base) === 0 ? HUNDRED : ONE;
  return Number(roundDivide(BigInt(amount) * numerator, denominator * step) * step);
}

/** An amount in hundredths of one currency, in hundredths of the base at `rate`. */
export function convertAmount(amount: number, rate: string, base: string): number {
  const { numerator, denominator } = rateFraction(rate);
  return scaled(amount, numerator, denominator, base);
}

export type ExchangeRate = {
  currency: string;
  baseCurrency: string;
  /** Normalised decimal text: 1 `currency` = `rate` `baseCurrency`. */
  rate: string;
  /** `YYYY-MM-DD`, the day it was set. */
  rateDate: string;
};

/** What a record really cost in another currency: both, or neither. */
export type Charged = { amount: number; currency: string };

export const chargedSchema = z
  .object({
    amount: z.number().int().positive('Enter more than 0'),
    currency: z.string().regex(CURRENCY_CODE, 'Three capital letters'),
  })
  .nullable();

/** Both columns, or neither: anything else reads as nothing charged. */
export function chargedFromRow(row: { charged_amount?: number | null; charged_currency?: string | null }): Charged | null {
  return row.charged_amount != null && row.charged_currency ? { amount: row.charged_amount, currency: row.charged_currency } : null;
}

/** A charged amount names another currency than the record's own (plan §3.2). */
export function chargedRefusal(currency: string, charged: Charged | null | undefined): string | null {
  if (!charged) return null;
  return charged.currency === currency ? `The charged amount must be in another currency than ${currency}.` : null;
}

/**
 * Said beside a charged amount once the record's own amount or currency is edited away from what it
 * was saved with: the charged amount was entered for that, and is kept as it is (QA O-02). Null
 * while they match, for a new record, or with no charged amount.
 */
export function chargedRecheck(
  saved: { amount?: number; currency?: string; charged?: Partial<Charged> | null } | undefined,
  now: { amount?: number; currency?: string; charged?: Partial<Charged> | null },
): string | null {
  if (!saved?.charged || !now.charged || saved.amount === undefined || !saved.currency) return null;
  const unchanged = now.amount === saved.amount && (now.currency ?? '').toUpperCase() === saved.currency;
  return unchanged
    ? null
    : `The charged amount was entered for ${formatMoney(saved.amount, saved.currency)} — check it still matches.`;
}

/** A booking counted in the trip's cost, with the records that pay towards it. */
export type BookingCost = {
  currency: string;
  /** The counted price, hundredths. */
  price: number;
  /** Its payments and linked expenses that carry a charged amount. */
  records: readonly { amount: number; charged: Charged | null }[];
};

/** A standalone expense. */
export type SpendingCost = { currency: string; amount: number; charged: Charged | null };

export type ConvertedTotal = {
  base: string;
  bookings: number;
  spending: number;
  total: number;
  /** Some part came from a typed-in rate: the total is an estimate (≈). */
  estimated: boolean;
  /**
   * Nothing was left out for want of a rate. Otherwise the total is partial — a known part only —
   * whether or not it is also estimated; the missing amounts are in `notIncluded`, never zero.
   */
  complete: boolean;
  /** Some amount was counted at all. Without one there is no total to show, only what is missing. */
  included: boolean;
  /** Rates actually applied, by currency. */
  ratesUsed: ExchangeRate[];
  /** Original amounts left out for want of a rate, per currency, largest first. */
  notIncluded: { currency: string; amount: number }[];
};

/** The rate that converts `currency` into `base`, if one was set against that base. */
export function rateFor(rates: readonly ExchangeRate[], currency: string, base: string): ExchangeRate | null {
  return rates.find((rate) => rate.currency === currency && rate.baseCurrency === base) ?? null;
}

/**
 * The trip's cost in `base` (plan §3.3). In `base` already: as it is. Otherwise a locked charged
 * amount where there is one, the rest at the typed-in rate, and with no rate, left out by name —
 * a booking whole, never half-counted.
 */
export function convertTripTotal(input: {
  base: string;
  rates: readonly ExchangeRate[];
  bookings: readonly BookingCost[];
  spending: readonly SpendingCost[];
}): ConvertedTotal {
  const { base, rates } = input;
  const used = new Map<string, ExchangeRate>();
  const missing = new Map<string, number>();
  let estimated = false;
  let included = false;

  const estimate = (amount: number, currency: string): number | null => {
    if (amount === 0) return 0;
    const rate = rateFor(rates, currency, base);
    if (!rate) return null;
    used.set(currency, rate);
    estimated = true;
    return convertAmount(amount, rate.rate, base);
  };
  const leaveOut = (currency: string, amount: number) => missing.set(currency, (missing.get(currency) ?? 0) + amount);

  let bookings = 0;
  for (const booking of input.bookings) {
    if (booking.currency === base) {
      bookings += booking.price;
      included = true;
      continue;
    }
    const locked = booking.records.filter((record) => record.charged?.currency === base);
    const lockedOriginal = locked.reduce((sum, record) => sum + record.amount, 0);
    const lockedBase = locked.reduce((sum, record) => sum + record.charged!.amount, 0);
    if (lockedOriginal >= booking.price && lockedOriginal > 0) {
      // Locked records cover the whole price: their cost, scaled down when they paid more than it.
      bookings += scaled(lockedBase, BigInt(booking.price), BigInt(lockedOriginal), base);
      included = true;
      continue;
    }
    const rest = estimate(booking.price - lockedOriginal, booking.currency);
    if (rest === null) leaveOut(booking.currency, booking.price);
    else {
      bookings += lockedBase + rest;
      included = true;
    }
  }

  let spending = 0;
  for (const expense of input.spending) {
    if (expense.currency === base) spending += expense.amount;
    else if (expense.charged?.currency === base) spending += expense.charged.amount;
    else {
      const converted = estimate(expense.amount, expense.currency);
      if (converted === null) {
        leaveOut(expense.currency, expense.amount);
        continue;
      }
      spending += converted;
    }
    included = true;
  }

  return {
    base,
    bookings,
    spending,
    total: bookings + spending,
    estimated,
    complete: missing.size === 0,
    included,
    ratesUsed: [...used.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    notIncluded: [...missing.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)),
  };
}

/** '1 USD = 0.92 EUR'. */
export function rateText(rate: Pick<ExchangeRate, 'currency' | 'baseCurrency' | 'rate'>): string {
  return `1 ${rate.currency} = ${rate.rate} ${rate.baseCurrency}`;
}
