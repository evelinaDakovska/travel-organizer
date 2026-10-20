import {
  lineText,
  lineType,
  pricedFor,
  priceForWhosGoing,
  pricingFromDraft,
  pricingMatches,
  pricingOf,
  pricingSchema,
  pricingText,
  pricingTotal,
  suggestPricingLines,
  withPricing,
  type Pricing,
  type RateLine,
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
  it('generates tagged Adult and Child lines when classifications are known, with no unit prices', () => {
    const lines = suggestPricingLines({
      participants: [
        { classification: 'adult' },
        { classification: 'adult' },
        { classification: 'child' },
      ],
      currentTotal: 3000,
    });
    expect(lines).toEqual([
      { label: 'Adult', quantity: 2, unitAmount: undefined, for: 'adult' },
      { label: 'Child', quantity: 1, unitAmount: undefined, for: 'child' },
    ]);
  });

  it('treats unspecified distinctly — for Anyone, never Adult — and invents no unit price', () => {
    const lines = suggestPricingLines({
      participants: [{ classification: 'adult' }, { classification: 'unspecified' }],
      currentTotal: 2000,
    });
    expect(lines).toEqual([
      { label: 'Adult', quantity: 1, unitAmount: undefined, for: 'adult' },
      { label: '', quantity: 1, unitAmount: undefined, for: 'any' },
    ]);
  });

  it('returns a single unlabelled line for Anyone when all participants are unspecified', () => {
    const lines = suggestPricingLines({
      participants: [{ classification: 'unspecified' }, { classification: 'unspecified' }],
      currentTotal: 4000,
    });
    expect(lines).toEqual([{ label: '', quantity: 2, unitAmount: undefined, for: 'any' }]);
  });

  it('handles empty participants gracefully', () => {
    const lines = suggestPricingLines({ participants: [], currentTotal: 5000 });
    expect(lines).toEqual([{ label: '', quantity: 1, unitAmount: undefined, for: 'any' }]);
  });
});

// ---- 3C: who a rate is for, group prices, extras (docs/phase3c-plan.md) ----

const tagged: Pricing = {
  mode: 'perPerson',
  lines: [
    { label: 'Adult', quantity: 2, unitAmount: 9000, for: 'adult' },
    { quantity: 1, unitAmount: 0, for: 'child' },
    { label: 'Sled', quantity: 2, unitAmount: 2000, extra: true },
  ],
};

const familyTicket: Pricing = {
  mode: 'perPerson',
  lines: [
    { label: 'Family ticket', quantity: 1, unitAmount: 12000, group: true },
    { label: 'Sled', quantity: 2, unitAmount: 2000, extra: true },
  ],
};

const adult = { classification: 'adult' as const };
const child = { classification: 'child' as const };
const unspecified = { classification: 'unspecified' as const };

describe('rateLineSchema (3C)', () => {
  const parse = (line: object) =>
    pricingSchema.safeParse({
      mode: 'perPerson',
      lines: [{ quantity: 1, unitAmount: 100, ...line }],
    });

  it('accepts who a person rate is for, a group price and an extra', () => {
    expect(pricingSchema.safeParse(tagged).success).toBe(true);
    expect(pricingSchema.safeParse(familyTicket).success).toBe(true);
    for (const audience of ['adult', 'child', 'any']) {
      expect(parse({ for: audience }).success).toBe(true);
    }
  });

  it('still accepts every line from before 3C, unchanged', () => {
    expect(pricingSchema.safeParse(family).success).toBe(true);
    expect(pricingOf({ pricing: family })).toEqual(family);
  });

  it('refuses an unknown audience, a false flag, and both flags at once', () => {
    expect(parse({ for: 'senior' }).success).toBe(false);
    expect(parse({ extra: false }).success).toBe(false);
    expect(parse({ group: false }).success).toBe(false);
    expect(parse({ group: true, extra: true }).success).toBe(false);
  });

  it('keeps a group price to one, and an audience off groups and extras', () => {
    expect(parse({ group: true, quantity: 2 }).error?.issues[0].message).toMatch(/one price/);
    expect(parse({ group: true, for: 'adult' }).success).toBe(false);
    expect(parse({ extra: true, for: 'child' }).success).toBe(false);
    expect(parse({ extra: true, quantity: 3 }).success).toBe(true);
  });

  it('keeps quantities whole and at least one, extras included', () => {
    expect(parse({ extra: true, quantity: 0 }).success).toBe(false);
    expect(parse({ extra: true, quantity: 1.5 }).success).toBe(false);
    expect(parse({ for: 'child', quantity: 0.5 }).success).toBe(false);
  });

  it('reads the new keys back, so an edit starts from all of them', () => {
    expect(pricingOf({ pricing: tagged })).toEqual(tagged);
    expect(pricingOf({ pricing: familyTicket })).toEqual(familyTicket);
  });
});

describe('lineType, pricedFor and pricingTotal (3C)', () => {
  it('tells the three kinds of line apart', () => {
    expect(familyTicket.lines.map(lineType)).toEqual(['group', 'extra']);
    expect(tagged.lines.map(lineType)).toEqual(['person', 'person', 'extra']);
  });

  it('counts people on person rates only', () => {
    expect(pricedFor(tagged)).toBe(3);
    expect(pricedFor(familyTicket)).toBe(0);
  });

  it('adds every line, free ones as nothing — the total equals the sum of the lines', () => {
    expect(pricingTotal(tagged.lines)).toBe(2 * 9000 + 0 + 2 * 2000);
    expect(pricingTotal(familyTicket.lines)).toBe(12000 + 4000);
    expect(pricingMatches({ pricing: familyTicket }, 16000)).toBe(true);
    expect(pricingMatches({ pricing: familyTicket }, 12000)).toBe(false);
  });
});

describe('lineText and pricingText (3C)', () => {
  it('names each kind of line', () => {
    expect(pricingText(tagged, 'EUR')).toBe(
      '2 × EUR 90.00 Adult + 1 × free Child + Extra: 2 × EUR 20.00 Sled = EUR 220.00',
    );
    expect(pricingText(familyTicket, 'EUR')).toBe(
      'Family ticket EUR 120.00 + Extra: 2 × EUR 20.00 Sled = EUR 160.00',
    );
  });

  it('prefers the label, says Anyone by saying nothing, and names an unnamed group', () => {
    expect(lineText({ label: 'Senior', quantity: 1, unitAmount: 500, for: 'adult' }, 'EUR')).toBe(
      '1 × EUR 5.00 Senior',
    );
    expect(lineText({ quantity: 3, unitAmount: 500, for: 'any' }, 'EUR')).toBe('3 × EUR 5.00');
    expect(lineText({ quantity: 1, unitAmount: 500, group: true }, 'EUR')).toBe(
      'Group price EUR 5.00',
    );
  });
});

describe('pricingFromDraft (3C)', () => {
  it("keeps every line's type and audience through an edit of another line", () => {
    const draft = [...tagged.lines, familyTicket.lines[0]].map((line) => ({ ...line }));
    draft[0] = { ...draft[0], unitAmount: 9500 };
    expect(pricingFromDraft(draft).lines).toEqual([
      { label: 'Adult', quantity: 2, unitAmount: 9500, for: 'adult' },
      { quantity: 1, unitAmount: 0, for: 'child' },
      { label: 'Sled', quantity: 2, unitAmount: 2000, extra: true },
      { label: 'Family ticket', quantity: 1, unitAmount: 12000, group: true },
    ]);
  });

  it('writes a line from before 3C back exactly as it was', () => {
    expect(pricingFromDraft(family.lines)).toEqual(family);
  });

  it('drops an empty label and an audience on a group or extra, and keeps a group at one', () => {
    expect(
      pricingFromDraft([
        { label: '  ', quantity: 2, unitAmount: 100 },
        { quantity: 3, unitAmount: 100, group: true, for: 'adult' },
        { quantity: 2, unitAmount: 100, extra: true, for: 'child' },
      ]).lines,
    ).toEqual([
      { quantity: 2, unitAmount: 100 },
      { quantity: 1, unitAmount: 100, group: true },
      { quantity: 2, unitAmount: 100, extra: true },
    ]);
  });
});

describe('priceForWhosGoing (3C)', () => {
  const adultRate: RateLine = { label: 'Adult', quantity: 1, unitAmount: 9000, for: 'adult' };
  const childRate: RateLine = { label: 'Child', quantity: 1, unitAmount: 6000, for: 'child' };
  const anyRate: RateLine = { quantity: 1, unitAmount: 5000, for: 'any' };
  const sled: RateLine = { label: 'Sled', quantity: 2, unitAmount: 2000, extra: true };
  const ticket: RateLine = { label: 'Family', quantity: 1, unitAmount: 12000, group: true };

  it('prices two adults and a child, and leaves extras exactly as they were', () => {
    expect(priceForWhosGoing([adultRate, childRate, sled], [adult, adult, child])).toEqual({
      kind: 'proposal',
      lines: [{ ...adultRate, quantity: 2 }, childRate, sled],
      total: 2 * 9000 + 6000 + 4000,
      removed: [],
    });
  });

  it('puts several children on the Child rate', () => {
    const result = priceForWhosGoing([adultRate, childRate], [adult, child, child, child]);
    expect(result.kind === 'proposal' && result.lines.map((l) => l.quantity)).toEqual([1, 3]);
  });

  it('never assumes someone not specified is an adult', () => {
    expect(priceForWhosGoing([adultRate], [adult, unspecified])).toEqual({
      kind: 'unpriced',
      adults: 0,
      children: 0,
      unspecified: 1,
    });
    expect(priceForWhosGoing([adultRate, anyRate], [adult, unspecified]).kind).toBe('same');
  });

  it('puts adults and children on Anyone when they have no rate of their own', () => {
    const result = priceForWhosGoing([anyRate], [adult, child, unspecified]);
    expect(result.kind === 'proposal' && result.lines).toEqual([{ ...anyRate, quantity: 3 }]);
  });

  it('says who has no rate', () => {
    expect(priceForWhosGoing([adultRate], [adult, child])).toEqual({
      kind: 'unpriced',
      adults: 0,
      children: 1,
      unspecified: 0,
    });
  });

  it('treats one untagged rate as for anyone, as Price for N always did', () => {
    const legacy: RateLine = { quantity: 2, unitAmount: 1000 };
    const result = priceForWhosGoing([legacy], [adult, adult, child, unspecified]);
    expect(result.kind === 'proposal' && result.lines).toEqual([{ ...legacy, quantity: 4 }]);
  });

  it('will not guess between untagged rates, or between two rates for the same people', () => {
    expect(priceForWhosGoing(family.lines, [adult, child]).kind).toBe('untagged');
    expect(priceForWhosGoing([adultRate, { quantity: 1, unitAmount: 1 }], [adult]).kind).toBe(
      'untagged',
    );
    expect(priceForWhosGoing([adultRate, { ...adultRate, label: 'Senior' }], [adult])).toEqual({
      kind: 'ambiguous',
      audience: 'adult',
    });
  });

  it('removes a rate nobody going is on, and says so', () => {
    expect(priceForWhosGoing([adultRate, childRate], [adult, adult])).toEqual({
      kind: 'proposal',
      lines: [{ ...adultRate, quantity: 2 }],
      total: 18000,
      removed: [childRate],
    });
  });

  it('offers nothing for a group price with extras, or with nobody going', () => {
    expect(priceForWhosGoing([ticket, sled], [adult, child]).kind).toBe('noPersonRates');
    expect(priceForWhosGoing([adultRate], []).kind).toBe('nobody');
  });

  it('keeps a group price beside person rates untouched', () => {
    const result = priceForWhosGoing([ticket, anyRate], [adult, adult]);
    expect(result.kind === 'proposal' && result.lines).toEqual([
      ticket,
      { ...anyRate, quantity: 2 },
    ]);
  });

  it('says when the rates already fit who is going', () => {
    expect(priceForWhosGoing([adultRate, childRate], [adult, child]).kind).toBe('same');
  });

  it('refuses a total too large to be exact', () => {
    const huge: RateLine = { quantity: 1, unitAmount: Number.MAX_SAFE_INTEGER, for: 'any' };
    expect(priceForWhosGoing([huge], [adult, adult]).kind).toBe('overflow');
  });

  it('never changes the lines it was given', () => {
    const lines = [adultRate, childRate, sled];
    const before = JSON.stringify(lines);
    priceForWhosGoing(lines, [adult, adult, adult]);
    expect(JSON.stringify(lines)).toBe(before);
  });
});
