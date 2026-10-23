import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_TRIP_RATE,
  SELECT_TRIP_BOOKING_PAYMENTS,
  SELECT_TRIP_RATES,
  UPDATE_TRIP_REPORT_CURRENCY,
  UPSERT_TRIP_RATE,
} from '../db/queries';
import { MoneyRuleError, parseBookingPaymentRow, type BookingPaymentRow } from '../domain/bookingPayments';
import { rateTextSchema, type ExchangeRate } from '../domain/conversion';
import { CURRENCY_CODE } from '../domain/currencies';
import { conversionCosts } from '../domain/tripConversion';
import { listExpenses } from './expenses';
import { listTripItems } from './tripItems';

/**
 * A trip's reporting currency and its typed-in rates (Phase 4, `docs/phase4-plan.md`). Converted
 * totals are never stored: `conversionInput` reads the records and the screens convert them.
 */

/** Everything a converted total reads. */
export const CONVERSION_TABLES = ['trips', 'trip_exchange_rates', 'trip_items', 'expenses', 'booking_payments'] as const;

type RateRow = {
  currency: string;
  base_currency: string;
  rate: string;
  rate_date: string;
};

const parseRateRow = (row: RateRow): ExchangeRate => ({
  currency: row.currency,
  baseCurrency: row.base_currency,
  rate: row.rate,
  rateDate: row.rate_date,
});

export async function listRates(db: SQLiteDatabase, tripId: string): Promise<ExchangeRate[]> {
  const rows = await db.getAllAsync<RateRow>(SELECT_TRIP_RATES, { $tripId: tripId });
  return rows.map(parseRateRow);
}

/** The trip's rates and the records that pay towards its bookings, as stored. */
export async function conversionRecords(db: SQLiteDatabase, tripId: string) {
  const [expenses, paymentRows, rates] = await Promise.all([
    listExpenses(db, tripId),
    db.getAllAsync<BookingPaymentRow>(SELECT_TRIP_BOOKING_PAYMENTS, { $tripId: tripId }),
    listRates(db, tripId),
  ]);
  return { expenses, payments: paymentRows.map(parseBookingPaymentRow), rates };
}

/** The trip's costs and rates, ready for `convertTripTotal`. */
export async function conversionInput(db: SQLiteDatabase, tripId: string) {
  const [items, { expenses, payments, rates }] = await Promise.all([
    listTripItems(db, tripId),
    conversionRecords(db, tripId),
  ]);
  return { ...conversionCosts(items, expenses, payments), rates };
}

export type CurrencySettings = {
  /** Null: the trip is not converted. Its rates are kept. */
  reportCurrency: string | null;
  /** Rates to the reporting currency as typed, by currency. Empty text removes that pair's rate. */
  rates: readonly { currency: string; rate: string }[];
  /** `YYYY-MM-DD`: the date a new or changed rate is recorded as set. */
  today: string;
};

/**
 * Saves the reporting currency and its rates in one transaction, or nothing. Every rate is a pair,
 * currency → reporting currency: one left unchanged keeps its date, a changed one takes today's, a
 * blank one removes that pair only. Rates to any other reporting currency are never touched, so
 * switching back finds them as they were (review P1).
 */
export async function saveCurrencySettings(
  db: SQLiteDatabase,
  tripId: string,
  settings: CurrencySettings,
): Promise<void> {
  const base = settings.reportCurrency;
  if (base !== null && !CURRENCY_CODE.test(base)) throw new MoneyRuleError('A currency is three letters, like EUR.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.today)) throw new MoneyRuleError('Pick a date.');

  const rates = settings.rates.map(({ currency, rate }) => {
    if (!CURRENCY_CODE.test(currency)) throw new MoneyRuleError('A currency is three letters, like EUR.');
    if (rate.trim() === '') return { currency, rate: null };
    if (base === null) throw new MoneyRuleError('Choose a reporting currency before entering rates.');
    if (currency === base) throw new MoneyRuleError(`${base} needs no rate: it is the reporting currency.`);
    const parsed = rateTextSchema.safeParse(rate);
    if (!parsed.success) {
      throw new MoneyRuleError(`${currency}: ${parsed.error.issues[0]?.message ?? 'Check the rate.'}`);
    }
    return { currency, rate: parsed.data };
  });

  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    const saved = new Map(
      (await listRates(db, tripId)).filter((rate) => rate.baseCurrency === base).map((rate) => [rate.currency, rate]),
    );
    const result = await db.runAsync(UPDATE_TRIP_REPORT_CURRENCY, { $tripId: tripId, $currency: base, $now: now });
    if (result.changes === 0) throw new MoneyRuleError('That trip is not here any more.');
    for (const { currency, rate } of rates) {
      const before = saved.get(currency);
      if (rate === null) {
        if (before) await db.runAsync(DELETE_TRIP_RATE, { $tripId: tripId, $currency: currency, $base: base });
        continue;
      }
      const unchanged = before && before.rate === rate;
      if (unchanged) continue;
      await db.runAsync(UPSERT_TRIP_RATE, {
        $tripId: tripId,
        $currency: currency,
        $base: base!,
        $rate: rate,
        $rateDate: settings.today,
        $now: now,
      });
    }
  });
}
