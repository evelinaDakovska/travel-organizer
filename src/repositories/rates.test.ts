import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { costFingerprint, tripBalances } from '../domain/balances';
import { MoneyRuleError } from '../domain/bookingPayments';
import { convertTripTotal } from '../domain/conversion';
import { buildExportDocument, parseExportDocument, planImport } from '../domain/export';
import type { ExpenseInput } from '../domain/spending';
import { tripItemInputSchema } from '../domain/tripItem';
import { applyImport, readTables } from './backup';
import { createExpense, getExpense, updateExpense } from './expenses';
import { createBookingPayment, getBookingPayment, updateBookingPayment } from './payments';
import { conversionInput, listRates, saveCurrencySettings } from './rates';
import { balanceInput, createSettlement, keepOutside } from './settlements';
import { createTripTraveller } from './travellers';
import { createTripItem } from './tripItems';
import { deleteTrip, getTrip } from './trips';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/** Phase 4 through the real repositories over better-sqlite3 (`docs/phase4-plan.md` §5). */

const now = '2026-10-23T09:00:00.000Z';
const schema = tripItemInputSchema('Europe/Helsinki');
const booking = (title: string, amount: number, currency: string) =>
  schema.parse({ kind: 'activity', status: 'confirmed', title, priceAmount: amount, priceCurrency: currency });
const expense = (amount: number, currency: string, extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  category: 'food',
  label: undefined,
  notes: undefined,
  amount,
  currency,
  spentOn: '2026-11-21',
  payerId: null,
  tripItemId: null,
  ...extra,
});

function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  raw
    .prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES ('t1', 'Lapland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
    )
    .run(now, now);
  return { raw, db: asyncDatabase(raw) };
}

const TABLES = ['trips', 'trip_rates', 'trip_exchange_rates', 'trip_items', 'expenses', 'booking_payments', 'settlements', 'unsplit_confirmations',
  'settlement_reviews', 'cost_shares'];
const snapshot = (raw: Database.Database) =>
  Object.fromEntries(TABLES.map((table) => [table, raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
const rateRows = (raw: Database.Database) =>
  raw
    .prepare(`SELECT currency, base_currency, rate, rate_date FROM trip_exchange_rates ORDER BY base_currency, currency`)
    .all();
const settings = (base: string | null, rates: Record<string, string>, today = '2026-10-23') => ({
  reportCurrency: base,
  rates: Object.entries(rates).map(([currency, rate]) => ({ currency, rate })),
  today,
});

describe('saveCurrencySettings', () => {
  it('sets the reporting currency and the rates, normalised, dated today', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', {
      reportCurrency: 'EUR',
      rates: [{ currency: 'USD', rate: '0,9200' }, { currency: 'JPY', rate: '0.0061' }],
      today: '2026-10-23',
    });
    expect((await getTrip(db, 't1'))?.reportCurrency).toBe('EUR');
    expect(rateRows(raw)).toEqual([
      { currency: 'JPY', base_currency: 'EUR', rate: '0.0061', rate_date: '2026-10-23' },
      { currency: 'USD', base_currency: 'EUR', rate: '0.92', rate_date: '2026-10-23' },
    ]);
  });

  it('keeps an unchanged rate and its date; a changed one takes the new date; a blank one is removed', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', {
      reportCurrency: 'EUR',
      rates: [{ currency: 'USD', rate: '0.92' }, { currency: 'GBP', rate: '1.15' }, { currency: 'NOK', rate: '0.085' }],
      today: '2026-10-20',
    });
    await saveCurrencySettings(db, 't1', {
      reportCurrency: 'EUR',
      rates: [{ currency: 'USD', rate: '0.920' }, { currency: 'GBP', rate: '1.16' }, { currency: 'NOK', rate: '' }],
      today: '2026-10-23',
    });
    expect(rateRows(raw)).toEqual([
      { currency: 'GBP', base_currency: 'EUR', rate: '1.16', rate_date: '2026-10-23' },
      { currency: 'USD', base_currency: 'EUR', rate: '0.92', rate_date: '2026-10-20' },
    ]);
  });

  it('keeps rates set for an earlier reporting currency, unused, until set again', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', { reportCurrency: 'EUR', rates: [{ currency: 'USD', rate: '0.92' }], today: '2026-10-20' });
    await saveCurrencySettings(db, 't1', { reportCurrency: 'GBP', rates: [], today: '2026-10-23' });
    expect(rateRows(raw)).toEqual([{ currency: 'USD', base_currency: 'EUR', rate: '0.92', rate_date: '2026-10-20' }]);

    await createExpense(db, 't1', expense(1000, 'USD'));
    const input = await conversionInput(db, 't1');
    const total = convertTripTotal({ base: 'GBP', ...input });
    expect(total.notIncluded).toEqual([{ currency: 'USD', amount: 1000 }]);

    // Not converting keeps every rate.
    await saveCurrencySettings(db, 't1', { reportCurrency: null, rates: [], today: '2026-10-23' });
    expect((await getTrip(db, 't1'))?.reportCurrency).toBeNull();
    expect(await listRates(db, 't1')).toHaveLength(1);
  });

  it('refuses a bad rate, a rate without a reporting currency, a rate for the reporting currency — and writes nothing', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', { reportCurrency: 'EUR', rates: [{ currency: 'USD', rate: '0.92' }], today: '2026-10-20' });
    const before = snapshot(raw);
    const attempts = [
      { reportCurrency: 'EUR', rates: [{ currency: 'GBP', rate: '1.15' }, { currency: 'USD', rate: '-1' }] },
      { reportCurrency: 'EUR', rates: [{ currency: 'USD', rate: '0' }] },
      { reportCurrency: null, rates: [{ currency: 'USD', rate: '0.9' }] },
      { reportCurrency: 'EUR', rates: [{ currency: 'EUR', rate: '1' }] },
      { reportCurrency: 'euro', rates: [] },
      { reportCurrency: 'EUR', rates: [{ currency: 'us', rate: '1' }] },
    ];
    for (const attempt of attempts) {
      await expect(saveCurrencySettings(db, 't1', { ...attempt, today: '2026-10-23' })).rejects.toThrow(MoneyRuleError);
    }
    await expect(saveCurrencySettings(db, 'nowhere', { reportCurrency: 'EUR', rates: [], today: '2026-10-23' })).rejects.toThrow(
      MoneyRuleError,
    );
    expect(snapshot(raw)).toEqual(before);
  });

  it('rates go with their trip', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', { reportCurrency: 'EUR', rates: [{ currency: 'USD', rate: '0.92' }], today: '2026-10-20' });
    await deleteTrip(db, 't1');
    expect(rateRows(raw)).toEqual([]);
  });
});

describe('rates per currency pair (review P1)', () => {
  it('keeps USD → EUR when USD → GBP is saved, and uses it again on switching back', async () => {
    const { raw, db } = setup();
    await createExpense(db, 't1', expense(10000, 'USD'));
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92' }, '2026-10-20'));
    await saveCurrencySettings(db, 't1', settings('GBP', { USD: '0.78' }, '2026-10-21'));
    await saveCurrencySettings(db, 't1', settings('EUR', {}, '2026-10-23'));
    expect(rateRows(raw)).toEqual([
      { currency: 'USD', base_currency: 'EUR', rate: '0.92', rate_date: '2026-10-20' },
      { currency: 'USD', base_currency: 'GBP', rate: '0.78', rate_date: '2026-10-21' },
    ]);
    const total = convertTripTotal({ base: 'EUR', ...(await conversionInput(db, 't1')) });
    expect(total.spending).toBe(9200);
    expect(total.ratesUsed.map((rate) => rate.rate)).toEqual(['0.92']);
  });

  it('switches between three reporting currencies, each keeping its own pairs', async () => {
    const { raw, db } = setup();
    await createExpense(db, 't1', expense(10000, 'USD'));
    await createExpense(db, 't1', expense(5000, 'NOK'));
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92', NOK: '0.085' }, '2026-10-20'));
    await saveCurrencySettings(db, 't1', settings('GBP', { USD: '0.78', NOK: '0.072' }, '2026-10-21'));
    await saveCurrencySettings(db, 't1', settings('JPY', { USD: '150', NOK: '13.5' }, '2026-10-22'));
    expect(rateRows(raw)).toHaveLength(6);

    const totals: Record<string, number> = {};
    for (const base of ['EUR', 'GBP', 'JPY']) {
      await saveCurrencySettings(db, 't1', settings(base, {}, '2026-10-23'));
      totals[base] = convertTripTotal({ base, ...(await conversionInput(db, 't1')) }).total;
    }
    expect(totals).toEqual({ EUR: 9200 + 425, GBP: 7800 + 360, JPY: 1500000 + 67500 });
    // Re-selecting a reporting currency retyped nothing, so no date changed.
    expect((rateRows(raw) as { rate_date: string }[]).map((row) => row.rate_date)).toEqual([
      '2026-10-20', '2026-10-20', '2026-10-21', '2026-10-21', '2026-10-22', '2026-10-22',
    ]);
  });

  it('changes one pair without touching the same currency to another base', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92' }, '2026-10-20'));
    await saveCurrencySettings(db, 't1', settings('GBP', { USD: '0.78' }, '2026-10-20'));
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.95' }, '2026-10-23'));
    expect(rateRows(raw)).toEqual([
      { currency: 'USD', base_currency: 'EUR', rate: '0.95', rate_date: '2026-10-23' },
      { currency: 'USD', base_currency: 'GBP', rate: '0.78', rate_date: '2026-10-20' },
    ]);
  });

  it('deletes one pair without deleting another', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92', NOK: '0.085' }, '2026-10-20'));
    await saveCurrencySettings(db, 't1', settings('GBP', { USD: '0.78' }, '2026-10-20'));
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '', NOK: '0.085' }, '2026-10-23'));
    expect(rateRows(raw)).toEqual([
      { currency: 'NOK', base_currency: 'EUR', rate: '0.085', rate_date: '2026-10-20' },
      { currency: 'USD', base_currency: 'GBP', rate: '0.78', rate_date: '2026-10-20' },
    ]);
  });

  it('never writes the frozen trip_rates table', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92' }));
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '' }));
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM trip_rates`).get()).toEqual({ n: 0 });
  });
});

describe('charged amounts', () => {
  it('are saved on an expense, kept by an edit that leaves them out, and cleared by null', async () => {
    const { db } = setup();
    const id = await createExpense(db, 't1', expense(1000, 'USD', { charged: { amount: 951, currency: 'EUR' } }));
    expect((await getExpense(db, id))?.charged).toEqual({ amount: 951, currency: 'EUR' });

    await updateExpense(db, id, expense(1200, 'USD'));
    expect((await getExpense(db, id))?.charged).toEqual({ amount: 951, currency: 'EUR' });

    await updateExpense(db, id, expense(1200, 'USD', { charged: null }));
    expect((await getExpense(db, id))?.charged).toBeNull();
  });

  it('must be in another currency than the expense, including after a currency change', async () => {
    const { raw, db } = setup();
    await expect(createExpense(db, 't1', expense(1000, 'USD', { charged: { amount: 951, currency: 'USD' } }))).rejects.toThrow(
      MoneyRuleError,
    );
    const id = await createExpense(db, 't1', expense(1000, 'USD', { charged: { amount: 951, currency: 'EUR' } }));
    const before = snapshot(raw);
    await expect(updateExpense(db, id, expense(1000, 'EUR'))).rejects.toThrow(/charged amount/);
    expect(snapshot(raw)).toEqual(before);
  });

  it('are saved on a booking payment, in another currency than the booking', async () => {
    const { db } = setup();
    const itemId = await createTripItem(db, 't1', booking('Husky safari', 25000, 'USD'));
    await expect(
      createBookingPayment(db, itemId, { amount: 10000, note: undefined, payerId: null, paidOn: null, charged: { amount: 9100, currency: 'USD' } }),
    ).rejects.toThrow(MoneyRuleError);
    const id = await createBookingPayment(db, itemId, {
      amount: 10000,
      note: undefined,
      payerId: null,
      paidOn: null,
      charged: { amount: 9100, currency: 'EUR' },
    });
    expect((await getBookingPayment(db, id))?.charged).toEqual({ amount: 9100, currency: 'EUR' });
    await updateBookingPayment(db, id, { amount: 10000, note: undefined, payerId: null, paidOn: '2026-10-01' });
    expect((await getBookingPayment(db, id))?.charged).toEqual({ amount: 9100, currency: 'EUR' });
    await updateBookingPayment(db, id, { amount: 10000, note: undefined, payerId: null, paidOn: '2026-10-01', charged: null });
    expect((await getBookingPayment(db, id))?.charged).toBeNull();
  });

  it('keep their own currency and amount when the reporting currency changes, and count again on switching back (review P3)', async () => {
    const { raw, db } = setup();
    const id = await createExpense(db, 't1', expense(10000, 'USD', { charged: { amount: 9510, currency: 'EUR' } }));
    const stored = () =>
      raw.prepare(`SELECT amount, currency, charged_amount, charged_currency, updated_at FROM expenses WHERE id = ?`).get(id);
    const before = stored();
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92' }));
    const inEur = convertTripTotal({ base: 'EUR', ...(await conversionInput(db, 't1')) });
    expect(inEur).toMatchObject({ spending: 9510, estimated: false, complete: true });

    await saveCurrencySettings(db, 't1', settings('GBP', { USD: '0.78' }));
    expect(stored()).toEqual(before);
    expect((await getExpense(db, id))?.charged).toEqual({ amount: 9510, currency: 'EUR' });
    // Never chained through a rate: in GBP it is the USD amount at the USD → GBP rate, an estimate.
    const inGbp = convertTripTotal({ base: 'GBP', ...(await conversionInput(db, 't1')) });
    expect(inGbp).toMatchObject({ spending: 7800, estimated: true });

    await saveCurrencySettings(db, 't1', settings('EUR', {}));
    expect(stored()).toEqual(before);
    expect(convertTripTotal({ base: 'EUR', ...(await conversionInput(db, 't1')) }).spending).toBe(9510);
  });

  it('change no balance and end no confirmation, and need no settlement review', async () => {
    const { raw, db } = setup();
    const ev = await createTripTraveller(db, 't1', 'Evelina', 'adult');
    const ana = await createTripTraveller(db, 't1', 'Ana', 'adult');
    const unsplit = await createExpense(db, 't1', expense(4000, 'USD', { payerId: ev }));
    const paid = await createExpense(db, 't1', expense(3000, 'USD', { payerId: ana }));
    await createSettlement(db, 't1', { fromId: ana, toId: ev, amount: 500, currency: 'USD', settledOn: '2026-11-22', note: undefined });
    const input = await balanceInput(db, 't1');
    const cost = input.costs.find((c) => c.kind === 'expense' && c.id === unsplit)!;
    await keepOutside(db, 't1', { kind: 'expense', id: unsplit }, costFingerprint(cost));
    const balancesBefore = tripBalances(await balanceInput(db, 't1'));
    const confirmations = raw.prepare(`SELECT * FROM unsplit_confirmations`).all();

    await updateExpense(db, unsplit, expense(4000, 'USD', { payerId: ev, charged: { amount: 3700, currency: 'EUR' } }));
    await updateExpense(db, paid, expense(3000, 'USD', { payerId: ana, charged: { amount: 2800, currency: 'EUR' } }));

    expect(tripBalances(await balanceInput(db, 't1'))).toEqual(balancesBefore);
    expect(raw.prepare(`SELECT * FROM unsplit_confirmations`).all()).toEqual(confirmations);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM settlement_reviews`).get()).toEqual({ n: 0 });
  });
});

describe('the converted total from the database', () => {
  it('locks charged payments and linked expenses, estimates the rest, names what has no rate', async () => {
    const { db } = setup();
    await saveCurrencySettings(db, 't1', { reportCurrency: 'EUR', rates: [{ currency: 'USD', rate: '0.95' }], today: '2026-10-23' });
    const safari = await createTripItem(db, 't1', booking('Husky safari', 25000, 'USD'));
    await createTripItem(db, 't1', booking('Hotel', 40000, 'EUR'));
    await createTripItem(db, 't1', booking('Ferry', 6000, 'NOK'));
    await createTripItem(db, 't1', schema.parse({ kind: 'activity', status: 'idea', title: 'Maybe', priceAmount: 9999, priceCurrency: 'USD' }));
    await createBookingPayment(db, safari, { amount: 10000, note: undefined, payerId: null, paidOn: null, charged: { amount: 9100, currency: 'EUR' } });
    await createExpense(db, 't1', expense(5000, 'USD', { tripItemId: safari }));
    await createExpense(db, 't1', expense(1000, 'USD', { charged: { amount: 951, currency: 'EUR' } }));
    await createExpense(db, 't1', expense(2400, 'EUR'));

    const total = convertTripTotal({ base: 'EUR', ...(await conversionInput(db, 't1')) });
    expect(total).toMatchObject({
      // 91.00 locked + (250 − 100) × 0.95; the hotel as it is; the ferry left out; the idea not counted.
      bookings: 9100 + 14250 + 40000,
      spending: 951 + 2400,
      estimated: true,
      notIncluded: [{ currency: 'NOK', amount: 6000 }],
    });
  });
});

describe('backups', () => {
  it('carry the reporting currency, every rate pair and the charged amounts', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', settings('GBP', { USD: '0.78' }));
    await saveCurrencySettings(db, 't1', { reportCurrency: 'EUR', rates: [{ currency: 'USD', rate: '0.92' }], today: '2026-10-23' });
    const itemId = await createTripItem(db, 't1', booking('Husky safari', 25000, 'USD'));
    await createBookingPayment(db, itemId, { amount: 10000, note: undefined, payerId: null, paidOn: null, charged: { amount: 9100, currency: 'EUR' } });
    await createExpense(db, 't1', expense(1000, 'USD', { charged: { amount: 951, currency: 'EUR' } }));

    const document = buildExportDocument(await readTables(db), { exportedAt: now });
    const parsed = parseExportDocument(JSON.parse(JSON.stringify(document)));
    if (!parsed.ok) throw new Error(parsed.reason);
    const restored = setup();
    restored.raw.prepare(`DELETE FROM trips`).run();
    await applyImport(restored.db, planImport(parsed.document, [], 'merge', []));
    expect(snapshot(restored.raw)).toEqual(snapshot(raw));
    expect(rateRows(restored.raw)).toHaveLength(2);
  });

  it('read a format-13 file: its rates become pairs, as migration 013 does', async () => {
    const { raw, db } = setup();
    await saveCurrencySettings(db, 't1', settings('EUR', { USD: '0.92' }));
    const document = JSON.parse(JSON.stringify(buildExportDocument(await readTables(db), { exportedAt: now })));
    // What 0.17.0 wrote: the rates in tripRates, and no tripExchangeRates.
    document.formatVersion = 13;
    document.tables.tripRates = document.tables.tripExchangeRates;
    delete document.tables.tripExchangeRates;
    const parsed = parseExportDocument(document);
    if (!parsed.ok) throw new Error(parsed.reason);
    const restored = setup();
    restored.raw.prepare(`DELETE FROM trips`).run();
    await applyImport(restored.db, planImport(parsed.document, [], 'merge', []));
    expect(rateRows(restored.raw)).toEqual(rateRows(raw));
    expect(restored.raw.prepare(`SELECT COUNT(*) AS n FROM trip_rates`).get()).toEqual({ n: 1 });
  });
});
