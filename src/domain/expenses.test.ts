import { countsAsSpent, refundableOf, tripExpenses, withRefundable } from './expenses';

type Priced = Parameters<typeof countsAsSpent>[0];

const priced = (over: Partial<Priced>): Priced => ({
  status: 'confirmed',
  priceAmount: 1000,
  priceCurrency: 'EUR',
  isPaid: false,
  details: null,
  ...over,
});

describe('refundable', () => {
  it('is unknown on every item saved before it existed', () => {
    expect(refundableOf(null)).toBeNull();
    expect(refundableOf({ from: 'Sofia' })).toBeNull();
    expect(refundableOf({ refundable: 'yes' })).toBeNull();
  });

  it('is stored beside other details, and removed rather than stored as unknown', () => {
    expect(withRefundable({ reminder: '1h' }, false)).toEqual({ reminder: '1h', refundable: false });
    expect(refundableOf(withRefundable(undefined, true))).toBe(true);
    expect(withRefundable({ refundable: true }, null)).toBeUndefined();
  });
});

describe('countsAsSpent', () => {
  it('counts what is booked, and a cancellation that cannot be refunded', () => {
    expect(countsAsSpent(priced({}))).toBe(true);
    expect(countsAsSpent(priced({ status: 'cancelled', details: { refundable: false } }))).toBe(true);
  });

  it('leaves out ideas, refunded or unspecified cancellations, and anything without a price', () => {
    expect(countsAsSpent(priced({ status: 'idea' }))).toBe(false);
    expect(countsAsSpent(priced({ status: 'cancelled', details: { refundable: true } }))).toBe(false);
    expect(countsAsSpent(priced({ status: 'cancelled' }))).toBe(false);
    expect(countsAsSpent(priced({ priceAmount: null, priceCurrency: null }))).toBe(false);
  });
});

describe('tripExpenses', () => {
  it('totals each currency on its own, paid and to pay, the largest first', () => {
    const lines = tripExpenses([
      priced({ priceAmount: 24000, isPaid: true }),
      priced({ priceAmount: 3150 }),
      priced({ priceAmount: 9000, priceCurrency: 'BGN', isPaid: true }),
      priced({ status: 'idea', priceAmount: 5000 }),
    ]);
    expect(lines).toEqual([
      { currency: 'EUR', total: 27150, paid: 24000, toPay: 3150, lost: 0, items: 2 },
      { currency: 'BGN', total: 9000, paid: 9000, toPay: 0, lost: 0, items: 1 },
    ]);
  });

  it('shows what non-refundable cancellations cost', () => {
    const [eur] = tripExpenses([
      priced({ priceAmount: 1000, isPaid: true }),
      priced({ status: 'cancelled', priceAmount: 4500, isPaid: true, details: { refundable: false } }),
    ]);
    expect(eur).toMatchObject({ total: 5500, paid: 5500, lost: 4500, items: 2 });
  });

  it('is empty when nothing has a price', () => {
    expect(tripExpenses([priced({ priceAmount: null, priceCurrency: null })])).toEqual([]);
  });
});
