import { conversionCosts, currenciesToConvert } from './tripConversion';
import type { TripItem } from './tripItem';

const item = (id: string, amount: number | null, currency: string | null, status: TripItem['status'] = 'confirmed') => ({
  id,
  status,
  priceAmount: amount,
  priceCurrency: currency,
  isPaid: false,
  details: null,
});

describe('conversionCosts', () => {
  it('takes the bookings the total counts, each with its payments and linked expenses', () => {
    const costs = conversionCosts(
      [item('safari', 25000, 'USD'), item('idea', 9000, 'USD', 'idea'), item('free', 0, 'EUR'), item('hotel', 40000, 'EUR')],
      [
        { amount: 5000, currency: 'USD', charged: null, tripItemId: 'safari' },
        { amount: 2400, currency: 'EUR', charged: null, tripItemId: null },
      ],
      [{ amount: 10000, charged: { amount: 9100, currency: 'EUR' }, tripItemId: 'safari' }],
    );
    expect(costs).toEqual({
      bookings: [
        {
          currency: 'USD',
          price: 25000,
          records: [
            { amount: 10000, charged: { amount: 9100, currency: 'EUR' } },
            { amount: 5000, charged: null },
          ],
        },
        { currency: 'EUR', price: 40000, records: [] },
      ],
      spending: [{ currency: 'EUR', amount: 2400, charged: null }],
    });
  });
});

describe('currenciesToConvert', () => {
  it('lists every currency but the base, with what it covers, largest first', () => {
    const costs = {
      bookings: [
        { currency: 'USD', price: 25000, records: [] },
        { currency: 'EUR', price: 40000, records: [] },
      ],
      spending: [
        { currency: 'NOK', amount: 50000, charged: null },
        { currency: 'USD', amount: 1000, charged: null },
      ],
    };
    expect(currenciesToConvert(costs, 'EUR')).toEqual([
      { currency: 'NOK', amount: 50000 },
      { currency: 'USD', amount: 26000 },
    ]);
    expect(currenciesToConvert(costs, null).map((line) => line.currency)).toEqual(['NOK', 'EUR', 'USD']);
  });
});
