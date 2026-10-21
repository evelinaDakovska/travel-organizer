import {
  bookingPaymentInputSchema,
  editRefusal,
  linkableBookings,
  overpaidWarning,
  parseBookingPaymentRow,
  possibleDuplicates,
  recordRefusal,
  recordsText,
  suggestedAmount,
} from './bookingPayments';

type Booking = Parameters<typeof possibleDuplicates>[1][number];

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'hotel',
  title: 'Hotel Aurora',
  status: 'confirmed',
  priceAmount: 25000,
  priceCurrency: 'EUR',
  isPaid: false,
  details: null,
  recordedPaid: 0,
  ...over,
});

const none = { payments: 0, linkedExpenses: 0 };
const two = { payments: 2, linkedExpenses: 1 };

describe('rows and input', () => {
  it('reads a row', () => {
    expect(
      parseBookingPaymentRow({
        id: 'p1',
        trip_id: 't1',
        trip_item_id: 'hotel',
        payer_id: null,
        amount: 10000,
        currency: 'EUR',
        paid_on: null,
        note: 'Deposit',
        created_at: 'c',
        updated_at: 'u',
      }),
    ).toEqual({
      id: 'p1',
      tripId: 't1',
      tripItemId: 'hotel',
      payerId: null,
      amount: 10000,
      currency: 'EUR',
      paidOn: null,
      note: 'Deposit',
      createdAt: 'c',
      updatedAt: 'u',
    });
  });

  it('needs a positive whole amount; payer and date may stay not recorded', () => {
    expect(bookingPaymentInputSchema.parse({ amount: 100, payerId: null, paidOn: null, note: ' ' })).toEqual({
      amount: 100,
      payerId: null,
      paidOn: null,
      note: undefined,
    });
    expect(bookingPaymentInputSchema.safeParse({ amount: 0, payerId: null, paidOn: null }).success).toBe(false);
    expect(bookingPaymentInputSchema.safeParse({ amount: 1.5, payerId: null, paidOn: null }).success).toBe(false);
    expect(bookingPaymentInputSchema.safeParse({ amount: 1, payerId: null, paidOn: '1 May' }).success).toBe(false);
  });
});

describe('recordRefusal', () => {
  it('allows a priced booking, confirmed or cancelled, in its own currency', () => {
    expect(recordRefusal(booking())).toBeNull();
    expect(recordRefusal(booking({ status: 'cancelled' }), 'EUR')).toBeNull();
  });

  it('refuses an idea, a booking without a price, and another currency', () => {
    expect(recordRefusal(booking({ status: 'idea' }))).toMatch(/saved place/);
    expect(recordRefusal(booking({ priceAmount: null, priceCurrency: null }))).toMatch(/Add the price/);
    expect(recordRefusal(booking({ priceAmount: 0 }))).toMatch(/Add the price/);
    expect(recordRefusal(booking(), 'BGN')).toMatch(/in EUR; this is in BGN.*never converted/);
  });
});

describe('editRefusal', () => {
  const saved = booking();

  it('lets anything through when there are no records', () => {
    expect(editRefusal(saved, { status: 'idea', priceAmount: null, priceCurrency: null }, none)).toBeNull();
  });

  it('keeps a booking with records a booking, priced, in its currency', () => {
    expect(editRefusal(saved, { status: 'idea', priceAmount: 25000, priceCurrency: 'EUR' }, two)).toMatch(
      /2 payments and 1 linked expense.*cancel it instead/,
    );
    expect(
      editRefusal(saved, { status: 'confirmed', priceAmount: null, priceCurrency: null }, two),
    ).toMatch(/keeps a price/);
    expect(
      editRefusal(saved, { status: 'confirmed', priceAmount: 25000, priceCurrency: 'BGN' }, two),
    ).toMatch(/stays in EUR/);
  });

  it('allows cancelling, and changing the amount', () => {
    expect(
      editRefusal(saved, { status: 'cancelled', priceAmount: 25000, priceCurrency: 'EUR' }, two),
    ).toBeNull();
    expect(
      editRefusal(saved, { status: 'confirmed', priceAmount: 9000, priceCurrency: 'EUR' }, two),
    ).toBeNull();
  });
});

describe('overpaidWarning', () => {
  it('warns only when the new price is below what is recorded', () => {
    expect(overpaidWarning(10000, 25000, 'EUR')).toBeNull();
    expect(overpaidWarning(10000, 10000, 'EUR')).toBeNull();
    expect(overpaidWarning(10000, 8000, 'EUR')).toMatch(/overpaid/);
  });
});

describe('recordsText', () => {
  it('names what there is', () => {
    expect(recordsText({ payments: 1, linkedExpenses: 0 })).toBe('1 payment');
    expect(recordsText({ payments: 0, linkedExpenses: 2 })).toBe('2 linked expenses');
    expect(recordsText(two)).toBe('2 payments and 1 linked expense');
  });
});

describe('linkableBookings', () => {
  it('offers priced bookings in the same currency, never ideas', () => {
    const items = [
      { ...booking(), kind: 'stay' as const },
      { ...booking({ id: 'b', priceCurrency: 'BGN' }), kind: 'stay' as const },
      { ...booking({ id: 'c', status: 'idea' }), kind: 'food' as const },
      { ...booking({ id: 'd', priceAmount: null, priceCurrency: null }), kind: 'other' as const },
      { ...booking({ id: 'e', status: 'cancelled' }), kind: 'activity' as const },
    ];
    expect(linkableBookings(items, 'EUR').map((item) => item.id)).toEqual(['hotel', 'e']);
  });
});

describe('possibleDuplicates', () => {
  it('finds a booking whose price or remaining balance the expense matches', () => {
    expect(possibleDuplicates({ amount: 25000, currency: 'EUR' }, [booking()])).toHaveLength(1);
    expect(
      possibleDuplicates({ amount: 15000, currency: 'EUR' }, [booking({ recordedPaid: 10000 })]),
    ).toHaveLength(1);
  });

  it('catches a booking already marked Paid logged again as spending', () => {
    expect(
      possibleDuplicates({ amount: 25000, currency: 'EUR' }, [booking({ isPaid: true })]),
    ).toHaveLength(1);
  });

  it('ignores another currency, another amount, ideas and refunded cancellations', () => {
    expect(possibleDuplicates({ amount: 25000, currency: 'BGN' }, [booking()])).toEqual([]);
    expect(possibleDuplicates({ amount: 24999, currency: 'EUR' }, [booking()])).toEqual([]);
    expect(
      possibleDuplicates({ amount: 25000, currency: 'EUR' }, [booking({ status: 'idea' })]),
    ).toEqual([]);
    expect(
      possibleDuplicates({ amount: 25000, currency: 'EUR' }, [
        booking({ status: 'cancelled', details: { refundable: true } }),
      ]),
    ).toEqual([]);
  });
});

describe('suggestedAmount', () => {
  it('is what is left to pay, or nothing', () => {
    expect(suggestedAmount(booking())).toBe(25000);
    expect(suggestedAmount(booking({ recordedPaid: 10000 }))).toBe(15000);
    expect(suggestedAmount(booking({ isPaid: true }))).toBeUndefined();
    expect(suggestedAmount(booking({ recordedPaid: 30000 }))).toBeUndefined();
  });
});
