import {
  countsAsSpent,
  expenseGroups,
  isFullyPaid,
  paidOf,
  paymentStatus,
  paymentStatuses,
  paymentSummary,
  refundableOf,
  refundNotSaid,
  tripExpenses,
  withRefundable,
} from './bookingCosts';

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

  it('leaves out a free booking: a price of 0 is not a cost (FB-1)', () => {
    expect(countsAsSpent(priced({ priceAmount: 0 }))).toBe(false);
    expect(countsAsSpent(priced({ priceAmount: 0, isPaid: true }))).toBe(false);
    expect(
      countsAsSpent(priced({ status: 'cancelled', priceAmount: 0, details: { refundable: false } })),
    ).toBe(false);
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

  it('neither counts nor owes a free booking', () => {
    const [eur] = tripExpenses([priced({ priceAmount: 2500 }), priced({ priceAmount: 0 })]);
    expect(eur).toMatchObject({ total: 2500, toPay: 2500, items: 1 });
  });
});

describe('expenseGroups', () => {
  it('lists the items behind the totals, owed first, in the order given', () => {
    const a = priced({ priceAmount: 100 });
    const b = priced({ priceAmount: 200, isPaid: true });
    const c = priced({ priceAmount: 300 });
    const lost = priced({ status: 'cancelled', isPaid: true, details: { refundable: false } });
    const idea = priced({ status: 'idea' });
    const comesBack = priced({ status: 'cancelled', isPaid: true, details: { refundable: true } });
    const free = priced({ priceAmount: null, priceCurrency: null });

    expect(expenseGroups([a, idea, b, comesBack, c, lost, free])).toEqual({
      toPay: [a, c],
      paid: [b, lost],
    });
  });

  it('agrees with the totals on how many items count', () => {
    const items = [priced({}), priced({ isPaid: true }), priced({ status: 'idea' })];
    const { toPay, paid } = expenseGroups(items);
    expect(toPay.length + paid.length).toBe(tripExpenses(items)[0].items);
  });
});

describe('refundNotSaid', () => {
  it('names a cancelled booking whose refund was never set, which the totals leave out', () => {
    const unknown = priced({ status: 'cancelled', priceAmount: 18000 });
    expect(countsAsSpent(unknown)).toBe(false);
    expect(refundNotSaid([unknown])).toEqual({
      items: [unknown],
      byCurrency: [{ currency: 'EUR', amount: 18000 }],
    });
  });

  it('leaves out cancellations that say refundable or not, and anything not cancelled', () => {
    const items = [
      priced({ status: 'cancelled', details: { refundable: true } }),
      priced({ status: 'cancelled', details: { refundable: false } }),
      priced({ status: 'confirmed' }),
      priced({ status: 'idea' }),
      priced({ status: 'cancelled', priceAmount: null, priceCurrency: null }),
      priced({ status: 'cancelled', priceAmount: 0 }),
    ];
    expect(refundNotSaid(items)).toEqual({ items: [], byCurrency: [] });
  });

  it('adds up per currency, never across currencies, largest first', () => {
    const { byCurrency } = refundNotSaid([
      priced({ status: 'cancelled', priceAmount: 5000 }),
      priced({ status: 'cancelled', priceAmount: 7000, priceCurrency: 'HUF' }),
      priced({ status: 'cancelled', priceAmount: 4000 }),
    ]);
    expect(byCurrency).toEqual([
      { currency: 'EUR', amount: 9000 },
      { currency: 'HUF', amount: 7000 },
    ]);
  });
});

describe('paymentStatus', () => {
  it('says paid or to pay for a confirmed item', () => {
    expect(paymentStatus(priced({ isPaid: true }))).toBe('paid');
    expect(paymentStatus(priced({}))).toBe('toPay');
  });

  it('counts Paid without a price, and says nothing when neither is known', () => {
    expect(paymentStatus(priced({ isPaid: true, priceAmount: null, priceCurrency: null }))).toBe(
      'paid',
    );
    expect(paymentStatus(priced({ priceAmount: null, priceCurrency: null }))).toBeNull();
  });

  it('says nothing for a free booking, and Paid when it is marked paid anyway (FB-1)', () => {
    expect(paymentStatus(priced({ priceAmount: 0 }))).toBeNull();
    expect(paymentStatus(priced({ priceAmount: 0, isPaid: true }))).toBe('paid');
  });

  it('says nothing for ideas and cancellations', () => {
    expect(paymentStatus(priced({ status: 'idea' }))).toBeNull();
    expect(paymentStatus(priced({ status: 'cancelled', isPaid: true }))).toBeNull();
  });
});

describe('paymentStatuses', () => {
  const leg = (id: string, over: Partial<Priced> = {}, journeyId: string | null = 'j1') => ({
    id,
    ...priced({ priceAmount: null, priceCurrency: null, ...over }),
    details: journeyId ? { journeyId } : null,
  });

  it('gives every leg of a journey the first leg’s state', () => {
    const paid = paymentStatuses([
      leg('a', { isPaid: true, priceAmount: 30000, priceCurrency: 'EUR' }),
      leg('b'),
      leg('c'),
    ]);
    expect([...paid.entries()]).toEqual([
      ['a', 'paid'],
      ['b', 'paid'],
      ['c', 'paid'],
    ]);

    const owed = paymentStatuses([leg('a', { priceAmount: 30000, priceCurrency: 'EUR' }), leg('b')]);
    expect(owed.get('b')).toBe('toPay');
  });

  it('keeps a leg’s own state, and lets To pay win when the legs disagree', () => {
    const statuses = paymentStatuses([
      leg('a', { isPaid: true }),
      leg('b', { priceAmount: 5000, priceCurrency: 'EUR' }),
      leg('c'),
    ]);
    expect(statuses.get('a')).toBe('paid');
    expect(statuses.get('b')).toBe('toPay');
    expect(statuses.get('c')).toBe('toPay');
  });

  it('gives a journey whose first leg is free no state at all', () => {
    const statuses = paymentStatuses([leg('a', { priceAmount: 0, priceCurrency: 'EUR' }), leg('b')]);
    expect(statuses.size).toBe(0);
  });

  it('takes nothing from a cancelled leg, and gives nothing to one', () => {
    expect(
      paymentStatuses([leg('a', { status: 'cancelled', isPaid: true }), leg('b')]).has('b'),
    ).toBe(false);
    expect(
      paymentStatuses([leg('a', { isPaid: true }), leg('b', { status: 'cancelled' })]).has('b'),
    ).toBe(false);
  });

  it('never mixes journeys, and leaves a lone item alone', () => {
    const statuses = paymentStatuses([
      leg('a', { isPaid: true }, 'j1'),
      leg('b', {}, 'j2'),
      leg('c', {}, null),
    ]);
    expect(statuses.has('b')).toBe(false);
    expect(statuses.has('c')).toBe(false);
  });
});

describe('payments recorded against a booking (3D-1)', () => {
  it('is one EUR 250 cost with EUR 250 paid — a deposit and a final payment, never EUR 500', () => {
    const booking = priced({ priceAmount: 25000, recordedPaid: 10000 + 15000 });
    expect(tripExpenses([booking])).toEqual([
      { currency: 'EUR', total: 25000, paid: 25000, toPay: 0, lost: 0, items: 1 },
    ]);
    expect(paymentStatus(booking)).toBe('paid');
    expect(expenseGroups([booking]).paid).toEqual([booking]);
  });

  it('a deposit leaves the rest to pay', () => {
    const booking = priced({ priceAmount: 25000, recordedPaid: 10000 });
    expect(paidOf(booking)).toBe(10000);
    expect(tripExpenses([booking])[0]).toMatchObject({ total: 25000, paid: 10000, toPay: 15000 });
    expect(paymentStatus(booking)).toBe('toPay');
    expect(paymentSummary(booking)).toEqual({
      currency: 'EUR',
      price: 25000,
      recorded: 10000,
      paid: 10000,
      toPay: 15000,
      overpaid: 0,
      notRecorded: 0,
    });
  });

  it('the Paid switch means paid in full; records describe the known part', () => {
    const legacy = priced({ priceAmount: 25000, isPaid: true });
    expect(paymentSummary(legacy)).toMatchObject({ paid: 25000, toPay: 0, recorded: 0, notRecorded: 25000 });
    const partlyKnown = priced({ priceAmount: 25000, isPaid: true, recordedPaid: 10000 });
    expect(paymentSummary(partlyKnown)).toMatchObject({
      paid: 25000,
      toPay: 0,
      recorded: 10000,
      notRecorded: 15000,
    });
    expect(paymentStatus(partlyKnown)).toBe('paid');
    expect(tripExpenses([partlyKnown])[0]).toMatchObject({ paid: 25000, toPay: 0 });
  });

  it('shows what is paid beyond the price, and never counts it', () => {
    const booking = priced({ priceAmount: 25000, recordedPaid: 27000 });
    expect(paymentSummary(booking)).toMatchObject({ paid: 25000, toPay: 0, overpaid: 2000 });
    expect(tripExpenses([booking])[0]).toMatchObject({ total: 25000, paid: 25000 });
  });

  it('a cancelled booking keeps its records, and counts only where the booking counts', () => {
    const refundable = priced({ status: 'cancelled', details: { refundable: true }, recordedPaid: 1000 });
    const lost = priced({ status: 'cancelled', details: { refundable: false }, recordedPaid: 400 });
    expect(tripExpenses([refundable])).toEqual([]);
    expect(tripExpenses([lost])[0]).toMatchObject({ total: 1000, paid: 400, toPay: 600, lost: 1000 });
    expect(paymentStatus(refundable)).toBeNull();
  });

  it('nothing recorded on a free or unpriced booking is ever paid or owed', () => {
    expect(paidOf(priced({ priceAmount: 0, recordedPaid: 500 }))).toBe(0);
    expect(paymentSummary(priced({ priceAmount: null, priceCurrency: null }))).toBeNull();
    expect(isFullyPaid(priced({ priceAmount: null, priceCurrency: null }))).toBe(false);
  });

  it('per currency, paid plus to pay is always the cost, whatever is recorded', () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const items = Array.from({ length: 1 + random(8) }, () => {
        const priceAmount = random(4) === 0 ? null : 1 + random(50000);
        return priced({
          priceAmount,
          priceCurrency: priceAmount === null ? null : ['EUR', 'BGN'][random(2)],
          isPaid: random(3) === 0,
          recordedPaid: random(2) === 0 ? 0 : random(60000),
          status: (['confirmed', 'cancelled', 'idea'] as const)[random(3)],
          details: random(2) === 0 ? { refundable: false } : null,
        });
      });
      for (const line of tripExpenses(items)) {
        expect(line.paid + line.toPay).toBe(line.total);
        expect(line.paid).toBeGreaterThanOrEqual(0);
        expect(line.toPay).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
