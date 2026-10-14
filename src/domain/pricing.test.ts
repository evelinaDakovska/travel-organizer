import {
  pricedFor,
  pricingMatches,
  pricingOf,
  pricingSchema,
  pricingText,
  pricingTotal,
  suggestPricingLines,
  withPricing,
  type Pricing,
} from './pricing';

const family: Pricing = {
  mode: 'perPerson',
  lines: [
    { label: 'Adult', quantity: 2, unitAmount: 9000 },
    { label: 'Child', quantity: 1, unitAmount: 6000 },
  ],
};

describe('pricingTotal', () => {
  it('adds each rate times its people, in minor units', () => {
    expect(pricingTotal(family.lines)).toBe(24000);
    expect(pricingTotal([{ quantity: 3, unitAmount: 1999 }])).toBe(5997);
  });

  it('is null rather than an imprecise number', () => {
    expect(pricingTotal([{ quantity: 1_000_000, unitAmount: Number.MAX_SAFE_INTEGER }])).toBeNull();
  });
});

describe('pricingSchema', () => {
  it('refuses a zero or fractional quantity, a negative price and no rates at all', () => {
    const line = (over: object) => ({
      mode: 'perPerson',
      lines: [{ quantity: 1, unitAmount: 1, ...over }],
    });
    expect(pricingSchema.safeParse(line({ quantity: 0 })).error?.issues[0].message).toMatch(
      /At least 1/,
    );
    expect(pricingSchema.safeParse(line({ quantity: 1.5 })).success).toBe(false);
    expect(pricingSchema.safeParse(line({ unitAmount: -100 })).success).toBe(false);
    expect(pricingSchema.safeParse({ mode: 'perPerson', lines: [] }).success).toBe(false);
  });

  it('accepts a free rate and no label', () => {
    const free = { mode: 'perPerson', lines: [{ quantity: 2, unitAmount: 0 }] };
    expect(pricingSchema.safeParse(free).success).toBe(true);
  });
});

describe('pricingOf and withPricing', () => {
  it('reads a breakdown, and nothing from a plain total or something unreadable', () => {
    expect(pricingOf({ pricing: family, reminder: '1h' })).toEqual(family);
    expect(pricingOf({ reminder: '1h' })).toBeNull();
    expect(pricingOf({ pricing: { mode: 'perPerson', lines: 'x' } })).toBeNull();
    expect(pricingOf(null)).toBeNull();
  });

  it('sets and removes the breakdown beside other details', () => {
    expect(withPricing({ reminder: '1h' }, family)).toEqual({ reminder: '1h', pricing: family });
    expect(withPricing({ reminder: '1h', pricing: family }, null)).toEqual({ reminder: '1h' });
    expect(withPricing({ pricing: family }, null)).toBeUndefined();
  });
});

describe('pricingText', () => {
  it('shows the working and the total', () => {
    expect(pricingText(family, 'EUR')).toBe(
      '2 × EUR 90.00 Adult + 1 × EUR 60.00 Child = EUR 240.00',
    );
    const single: Pricing = { mode: 'perPerson', lines: [{ quantity: 3, unitAmount: 2500 }] };
    expect(pricingText(single, 'BGN')).toBe('3 × BGN 25.00 = BGN 75.00');
  });
});

describe('pricedFor', () => {
  it('counts the people the rates are for', () => {
    expect(pricedFor(family)).toBe(3);
  });
});

describe('pricingMatches', () => {
  it('holds for a plain total, and for a breakdown that adds up to the price', () => {
    expect(pricingMatches({ reminder: '1h' }, 12345)).toBe(true);
    expect(pricingMatches({ pricing: family }, 24000)).toBe(true);
  });

  it('fails when they disagree, or the breakdown cannot be read', () => {
    expect(pricingMatches({ pricing: family }, 24001)).toBe(false);
    expect(pricingMatches({ pricing: family }, undefined)).toBe(false);
    expect(pricingMatches({ pricing: { mode: 'other' } }, 24000)).toBe(false);
  });
});

describe('suggestPricingLines', () => {
  it('generates Adult and Child lines when classifications are known, with undefined unit prices', () => {
    const lines = suggestPricingLines({
      participants: [
        { classification: 'adult' },
        { classification: 'adult' },
        { classification: 'child' },
      ],
      currentTotal: 3000,
    });
    expect(lines).toEqual([
      { label: 'Adult', quantity: 2, unitAmount: undefined },
      { label: 'Child', quantity: 1, unitAmount: undefined },
    ]);
  });

  it('treats unspecified distinctly, never assuming Adult or inventing unit price', () => {
    const lines = suggestPricingLines({
      participants: [
        { classification: 'adult' },
        { classification: 'unspecified' },
      ],
      currentTotal: 2000,
    });
    expect(lines).toEqual([
      { label: 'Adult', quantity: 1, unitAmount: undefined },
      { label: '', quantity: 1, unitAmount: undefined },
    ]);
  });

  it('returns a single unlabelled line when all participants are unspecified', () => {
    const lines = suggestPricingLines({
      participants: [
        { classification: 'unspecified' },
        { classification: 'unspecified' },
      ],
      currentTotal: 4000,
    });
    expect(lines).toEqual([
      { label: '', quantity: 2, unitAmount: undefined },
    ]);
  });

  it('handles empty participants gracefully', () => {
    const lines = suggestPricingLines({
      participants: [],
      currentTotal: 5000,
    });
    expect(lines).toEqual([
      { label: '', quantity: 1, unitAmount: undefined },
    ]);
  });
});
