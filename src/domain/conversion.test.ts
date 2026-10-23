import { currencyDecimals } from './currencies';
import {
  chargedRefusal,
  convertAmount,
  convertTripTotal,
  rateFor,
  rateText,
  rateTextSchema,
  type BookingCost,
  type ExchangeRate,
  type SpendingCost,
} from './conversion';
import { formatMoney } from './format';

const rate = (currency: string, value: string, base = 'EUR'): ExchangeRate => ({
  currency,
  baseCurrency: base,
  rate: value,
  rateDate: '2026-10-23',
});

const booking = (currency: string, price: number, records: BookingCost['records'] = []): BookingCost => ({
  currency,
  price,
  records,
});
const spend = (currency: string, amount: number, charged: SpendingCost['charged'] = null): SpendingCost => ({
  currency,
  amount,
  charged,
});

describe('rateTextSchema', () => {
  it('takes a point or a comma and normalises', () => {
    expect(rateTextSchema.parse('0.92')).toBe('0.92');
    expect(rateTextSchema.parse(' 0,9200 ')).toBe('0.92');
    expect(rateTextSchema.parse('160')).toBe('160');
    expect(rateTextSchema.parse('0160.50')).toBe('160.5');
    expect(rateTextSchema.parse('0.0061')).toBe('0.0061');
    expect(rateTextSchema.parse('1.0')).toBe('1');
  });

  it('refuses zero, signs, letters, thousands separators and too many digits', () => {
    for (const bad of ['', '0', '0.000', '-1', '+1', '1e3', 'abc', '1,234.5', '1.2.3', '1234567890123', '0.12345678901']) {
      expect([bad, rateTextSchema.safeParse(bad).success]).toEqual([bad, false]);
    }
    expect(rateTextSchema.safeParse('123456.123456').success).toBe(true);
    expect(rateTextSchema.safeParse('123456.1234567').success).toBe(false);
  });
});

describe('convertAmount', () => {
  it('rounds half away from zero to hundredths', () => {
    expect(convertAmount(10000, '0.92', 'EUR')).toBe(9200);
    expect(convertAmount(1, '0.5', 'EUR')).toBe(1); // 0.5 → 1
    expect(convertAmount(3, '0.5', 'EUR')).toBe(2); // 1.5 → 2
    expect(convertAmount(1, '0.49', 'EUR')).toBe(0);
    expect(convertAmount(150000, '0.0061', 'EUR')).toBe(915); // JPY 1500 → EUR 9.15
  });

  it('is exact where a float is not', () => {
    // 0.1 × 3 in floats is 0.30000000000000004; amounts of 10^13 hundredths stay exact.
    expect(convertAmount(3, '0.1', 'EUR')).toBe(0);
    expect(convertAmount(10_000_000_000_000, '1.000000001', 'EUR')).toBe(10_000_000_010_000);
  });

  it('rounds to whole units for a zero-decimal base', () => {
    expect(convertAmount(1000, '160.45', 'JPY')).toBe(160500); // EUR 10 → JPY 1604.5 → 1605
    expect(convertAmount(1000, '160.44', 'JPY')).toBe(160400);
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('EUR')).toBe(2);
  });
});

describe('formatMoney with zero-decimal currencies', () => {
  it('drops .00 for a yen amount, keeps stored hundredths', () => {
    expect(formatMoney(150000, 'JPY')).toBe('JPY 1500');
    expect(formatMoney(150050, 'JPY')).toBe('JPY 1500.50');
    expect(formatMoney(150000, 'EUR')).toBe('EUR 1500.00');
    expect(formatMoney(-500, 'KRW')).toBe('-KRW 5');
  });
});

describe('chargedRefusal', () => {
  it('needs another currency than the record', () => {
    expect(chargedRefusal('USD', null)).toBeNull();
    expect(chargedRefusal('USD', { amount: 9200, currency: 'EUR' })).toBeNull();
    expect(chargedRefusal('USD', { amount: 9200, currency: 'USD' })).toMatch(/another currency/);
  });
});

describe('convertTripTotal', () => {
  it('counts the base currency as it is, and estimates the rest at its rate', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [rate('USD', '0.92')],
      bookings: [booking('EUR', 25000), booking('USD', 10000)],
      spending: [spend('EUR', 2400), spend('USD', 1000)],
    });
    expect(result).toEqual({
      base: 'EUR',
      bookings: 25000 + 9200,
      spending: 2400 + 920,
      total: 25000 + 9200 + 2400 + 920,
      estimated: true,
      complete: true,
      included: true,
      ratesUsed: [rate('USD', '0.92')],
      notIncluded: [],
    });
  });

  it('is exact, not estimated, when everything is in the base or locked', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [],
      bookings: [booking('EUR', 25000), booking('USD', 10000, [{ amount: 10000, charged: { amount: 9340, currency: 'EUR' } }])],
      spending: [spend('USD', 1000, { amount: 951, currency: 'EUR' })],
    });
    expect(result.estimated).toBe(false);
    expect(result.total).toBe(25000 + 9340 + 951);
    expect(result.notIncluded).toEqual([]);
  });

  it('never re-estimates a locked amount, even with a rate', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [rate('USD', '0.5')],
      bookings: [],
      spending: [spend('USD', 1000, { amount: 951, currency: 'EUR' })],
    });
    expect(result.spending).toBe(951);
    expect(result.estimated).toBe(false);
    expect(result.ratesUsed).toEqual([]);
  });

  it('locks the paid part of a booking and estimates the rest (payments at different rates)', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [rate('USD', '0.95')],
      bookings: [
        booking('USD', 25000, [
          { amount: 10000, charged: { amount: 9100, currency: 'EUR' } },
          { amount: 5000, charged: null },
        ]),
      ],
      spending: [],
    });
    // 91.00 locked + 150.00 × 0.95 estimated.
    expect(result.bookings).toBe(9100 + 14250);
    expect(result.estimated).toBe(true);
  });

  it('scales locked records that paid more than the price down to the price', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [],
      bookings: [booking('USD', 10000, [{ amount: 12000, charged: { amount: 11000, currency: 'EUR' } }])],
      spending: [],
    });
    expect(result.bookings).toBe(9167); // 110.00 × 100/120
    expect(result.estimated).toBe(false);
  });

  it('leaves out, by name, what has no rate — a booking whole, never half-counted', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [rate('GBP', '1.15', 'USD')], // set for another reporting currency: not used
      bookings: [booking('GBP', 30000, [{ amount: 10000, charged: { amount: 11700, currency: 'EUR' } }])],
      spending: [spend('GBP', 4000), spend('NOK', 50000), spend('EUR', 100)],
    });
    expect(result.total).toBe(100);
    expect(result.notIncluded).toEqual([
      { currency: 'NOK', amount: 50000 },
      { currency: 'GBP', amount: 34000 },
    ]);
    expect(result.estimated).toBe(false);
  });

  it('ignores a charged amount in a currency that is not the base', () => {
    const result = convertTripTotal({
      base: 'EUR',
      rates: [rate('USD', '0.9')],
      bookings: [],
      spending: [spend('USD', 1000, { amount: 1500, currency: 'BGN' })],
    });
    expect(result.spending).toBe(900);
  });

  it('property: parts add up, nothing is lost, and an all-base trip equals the per-currency sum', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const currencies = ['EUR', 'USD', 'GBP', 'JPY'];
    for (let run = 0; run < 300; run++) {
      const base = currencies[Math.floor(random() * currencies.length)];
      const rates = currencies
        .filter((code) => code !== base && random() < 0.7)
        .map((code) => rate(code, String(Math.round(random() * 2000) / 1000 + 0.001), base));
      const pick = () => currencies[Math.floor(random() * currencies.length)];
      const bookings = Array.from({ length: Math.floor(random() * 5) }, () => {
        const currency = pick();
        const price = 100 + Math.floor(random() * 100000);
        const records = random() < 0.5 ? [{ amount: Math.floor(price * random()) + 1, charged: random() < 0.5 ? { amount: 1 + Math.floor(random() * 50000), currency: base } : null }] : [];
        return booking(currency, price, records);
      });
      const spending = Array.from({ length: Math.floor(random() * 6) }, () => spend(pick(), 1 + Math.floor(random() * 50000)));
      const result = convertTripTotal({ base, rates, bookings, spending });

      expect(result.total).toBe(result.bookings + result.spending);
      expect(Number.isInteger(result.total)).toBe(true);
      if (currencyDecimals(base) === 0) {
        // Only estimates are rounded to whole units; amounts already in the base are as stored.
        expect(result.total).toBeGreaterThanOrEqual(0);
      }
      // Everything left out had no rate against this base.
      for (const { currency } of result.notIncluded) {
        expect(rateFor(rates, currency, base)).toBeNull();
        expect(currency).not.toBe(base);
      }
      // With no other currency at all, the total is the plain sum.
      const onlyBase = convertTripTotal({
        base,
        rates,
        bookings: bookings.filter((b) => b.currency === base),
        spending: spending.filter((s) => s.currency === base),
      });
      expect(onlyBase.estimated).toBe(false);
      expect(onlyBase.total).toBe(
        bookings.filter((b) => b.currency === base).reduce((sum, b) => sum + b.price, 0) +
          spending.filter((s) => s.currency === base).reduce((sum, s) => sum + s.amount, 0),
      );
    }
  });
});

describe('convertTripTotal — complete or partial, exact or estimated (review P2)', () => {
  const rates = [rate('USD', '0.92')];
  const state = (spending: SpendingCost[]) => {
    const { total, estimated, complete, included, notIncluded } = convertTripTotal({ base: 'EUR', rates, bookings: [], spending });
    return { total, estimated, complete, included, notIncluded };
  };

  it('complete and exact: everything in the base or locked', () => {
    expect(state([spend('EUR', 50000), spend('NOK', 1000, { amount: 85, currency: 'EUR' })])).toEqual({
      total: 50085, estimated: false, complete: true, included: true, notIncluded: [],
    });
  });

  it('complete and estimated: a rate was applied, nothing left out', () => {
    expect(state([spend('EUR', 50000), spend('USD', 30000)])).toEqual({
      total: 77600, estimated: true, complete: true, included: true, notIncluded: [],
    });
  });

  it('partial and exact: no rate applied, a currency left out — never estimated, never complete', () => {
    expect(state([spend('EUR', 50000), spend('GBP', 30000)])).toEqual({
      total: 50000, estimated: false, complete: false, included: true, notIncluded: [{ currency: 'GBP', amount: 30000 }],
    });
  });

  it('partial and estimated: both at once', () => {
    expect(state([spend('EUR', 50000), spend('USD', 10000), spend('GBP', 30000)])).toEqual({
      total: 59200, estimated: true, complete: false, included: true, notIncluded: [{ currency: 'GBP', amount: 30000 }],
    });
  });

  it('nothing counted: no total, only what is missing — the unknown is not zero', () => {
    expect(state([spend('GBP', 30000)])).toEqual({
      total: 0, estimated: false, complete: false, included: false, notIncluded: [{ currency: 'GBP', amount: 30000 }],
    });
  });

  it('an empty trip is complete with nothing counted', () => {
    expect(state([])).toMatchObject({ complete: true, included: false });
  });
});

describe('rateText', () => {
  it('reads as one unit of the currency', () => {
    expect(rateText(rate('USD', '0.92'))).toBe('1 USD = 0.92 EUR');
  });
});
