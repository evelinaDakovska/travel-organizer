import {
  bookingSplitEditRefusal,
  bookingSplitRefusal,
  coverOf,
  coverRefusal,
  coverText,
  expenseSplitEditRefusal,
  expenseSplitRefusal,
  fillFromPrices,
  holdsRefusal,
  shareAmounts,
  splitEqually,
  splitMismatchWarning,
  splitMode,
  splitRefusal,
  splitGoesText,
  splitSummary,
  whoIsGoing,
  type Member,
} from './costShares';
import type { Pricing } from './pricing';

const ev: Member = { id: 'ev', name: 'Evelina', classification: 'adult' };
const ana: Member = { id: 'ana', name: 'Ana', classification: 'adult' };
const mia: Member = { id: 'mia', name: 'Mia', classification: 'child' };
const leo: Member = { id: 'leo', name: 'Leo', classification: 'child' };
const sam: Member = { id: 'sam', name: 'Sam', classification: 'unspecified' };
const members = new Map([ev, ana, mia, leo, sam].map((m) => [m.id, m]));

const equal = (...ids: string[]) => ({
  people: ids.map((travellerId) => ({ travellerId, amount: null, coveredBy: null })),
});
const byAmounts = (...rows: [string, number][]) => ({
  people: rows.map(([travellerId, amount]) => ({ travellerId, amount, coveredBy: null })),
});
const shares = (...rows: [string, number | null][]) =>
  rows.map(([travellerId, amount], sortOrder) => ({ travellerId, amount, sortOrder, coveredBy: null }));

describe('splitting equally (invariant E)', () => {
  it('gives the leftover cents one each to the first in the split’s order', () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqually(1001, 3)).toEqual([334, 334, 333]);
    expect(splitEqually(9000, 3)).toEqual([3000, 3000, 3000]);
    expect(splitEqually(1, 3)).toEqual([1, 0, 0]);
    expect(splitEqually(0, 2)).toEqual([0, 0]);
    expect(splitEqually(500, 0)).toEqual([]);
  });

  it('always adds up exactly, for any total and 1–12 people (property)', () => {
    let seed = 11;
    const random = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    for (let run = 0; run < 2000; run++) {
      const total = random(10_000_000);
      const n = 1 + random(12);
      const parts = splitEqually(total, n);
      expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      expect([...parts].sort((a, b) => b - a)).toEqual(parts); // the extra cents come first
    }
  });
});

describe('share amounts for the cost as it is now', () => {
  it('an equal split follows the current cost', () => {
    const split = shares(['ev', null], ['ana', null], ['mia', null]);
    expect(shareAmounts(9000, split)).toEqual({
      shares: [
        { travellerId: 'ev', amount: 3000 },
        { travellerId: 'ana', amount: 3000 },
        { travellerId: 'mia', amount: 3000 },
      ],
      unallocated: 0,
    });
    expect(shareAmounts(10000, split).shares.map((s) => s.amount)).toEqual([3334, 3333, 3333]);
  });

  it('a split by amounts stays as saved, and says what no longer adds up', () => {
    const split = shares(['ev', 4000], ['ana', 4000], ['mia', 2000]);
    expect(shareAmounts(10000, split).unallocated).toBe(0);
    expect(shareAmounts(11000, split)).toMatchObject({ unallocated: 1000 });
    expect(shareAmounts(9000, split)).toMatchObject({ unallocated: -1000 });
    expect(shareAmounts(11000, split).shares.map((s) => s.amount)).toEqual([4000, 4000, 2000]);
  });

  it('orders by the split’s order, not the rows’', () => {
    const split = [
      { travellerId: 'mia', amount: null, sortOrder: 2 },
      { travellerId: 'ev', amount: null, sortOrder: 0 },
      { travellerId: 'ana', amount: null, sortOrder: 1 },
    ];
    expect(shareAmounts(1000, split).shares).toEqual([
      { travellerId: 'ev', amount: 334 },
      { travellerId: 'ana', amount: 333 },
      { travellerId: 'mia', amount: 333 },
    ]);
  });

  it('not split: the whole cost is unallocated', () => {
    expect(shareAmounts(5000, [])).toEqual({ shares: [], unallocated: 5000 });
    expect(splitMode([])).toBeNull();
    expect(splitSummary([])).toBe('Not split');
    expect(splitSummary(shares(['ev', null], ['ana', null], ['mia', null]))).toBe('Split equally between 3');
    expect(splitSummary(shares(['ev', 1], ['ana', 2]))).toBe('Split by amounts between 2');
  });
});

describe('who covers a child’s share (invariant D)', () => {
  const tripCover = [
    { childId: 'mia', adultId: 'ana', sortOrder: 1 },
    { childId: 'mia', adultId: 'ev', sortOrder: 0 },
  ];

  const classOf = (overrides: Record<string, Member['classification']> = {}) => (id: string) =>
    overrides[id] ?? members.get(id)?.classification;

  it('an adult’s or a not-specified person’s share is their own', () => {
    expect(coverOf({ travellerId: 'ev', coveredBy: null }, classOf(), tripCover)).toEqual({ kind: 'own' });
    expect(coverOf({ travellerId: 'sam', coveredBy: null }, classOf(), tripCover)).toEqual({ kind: 'own' });
  });

  it('the share’s override first, then the trip’s adults in their order, else not covered', () => {
    expect(coverOf({ travellerId: 'mia', coveredBy: 'ana' }, classOf(), tripCover)).toEqual({
      kind: 'covered',
      adultIds: ['ana'],
      source: 'override',
    });
    expect(coverOf({ travellerId: 'mia', coveredBy: null }, classOf(), tripCover)).toEqual({
      kind: 'covered',
      adultIds: ['ev', 'ana'],
      source: 'trip',
    });
    expect(coverOf({ travellerId: 'leo', coveredBy: null }, classOf(), tripCover)).toEqual({ kind: 'notCovered' });
  });

  it('a child reclassified as an adult on the trip pays their own; the override stays dormant', () => {
    expect(coverOf({ travellerId: 'mia', coveredBy: 'ana' }, classOf({ mia: 'adult' }), tripCover)).toEqual({
      kind: 'own',
    });
  });

  it('a covering adult reclassified as a child no longer covers anyone', () => {
    expect(coverOf({ travellerId: 'mia', coveredBy: 'ana' }, classOf({ ana: 'child' }), tripCover)).toEqual({
      kind: 'covered',
      adultIds: ['ev'],
      source: 'trip',
    });
    expect(
      coverOf({ travellerId: 'mia', coveredBy: null }, classOf({ ev: 'child', ana: 'unspecified' }), tripCover),
    ).toEqual({ kind: 'notCovered' });
  });

  it('refuses a trip cover that is not by adults of the trip, for a child of the trip', () => {
    expect(coverRefusal('mia', ['ev', 'ana'], members)).toBeNull();
    expect(coverRefusal('mia', [], members)).toBeNull(); // clears it
    expect(coverRefusal('ev', ['ana'], members)).toMatch(/not a child/);
    expect(coverRefusal('ghost', ['ana'], members)).toMatch(/not on this trip/);
    expect(coverRefusal('mia', ['leo'], members)).toMatch(/Leo is not an adult/);
    expect(coverRefusal('mia', ['sam'], members)).toMatch(/Sam is not an adult/);
    expect(coverRefusal('mia', ['mia'], members)).toMatch(/own share/);
    expect(coverRefusal('mia', ['ghost'], members)).toMatch(/must be on this trip/);
    expect(coverRefusal('mia', ['ev', 'ev'], members)).toMatch(/twice/);
  });
});

describe('what may be split', () => {
  const booking = { kind: 'activity' as const, title: 'Safari', status: 'confirmed' as const, priceAmount: 9000, priceCurrency: 'EUR' };

  it('a booking with a price, confirmed or cancelled', () => {
    expect(bookingSplitRefusal(booking)).toBeNull();
    expect(bookingSplitRefusal({ ...booking, status: 'cancelled' })).toBeNull();
    expect(bookingSplitRefusal({ ...booking, status: 'idea' })).toMatch(/budget/);
    expect(bookingSplitRefusal({ ...booking, priceAmount: null })).toMatch(/Add the price/);
    expect(bookingSplitRefusal({ ...booking, priceAmount: 0 })).toMatch(/Add the price/);
    expect(bookingSplitRefusal({ ...booking, kind: 'task' })).toMatch(/to-do/);
  });

  it('a standalone expense, not one that pays for a booking', () => {
    expect(expenseSplitRefusal({ tripItemId: null })).toBeNull();
    expect(expenseSplitRefusal({ tripItemId: 'hotel' }, 'Hotel Aurora')).toMatch(/pays for “Hotel Aurora”/);
  });
});

describe('a split as saved', () => {
  it('equally, or by amounts that add up to the cost', () => {
    expect(splitRefusal(equal('ev', 'ana', 'mia'), 9000, 'EUR', members)).toBeNull();
    expect(splitRefusal(byAmounts(['ev', 4000], ['ana', 4000], ['mia', 1000]), 9000, 'EUR', members)).toBeNull();
    expect(splitRefusal(byAmounts(['ev', 9000], ['mia', 0]), 9000, 'EUR', members)).toBeNull(); // free
    expect(splitRefusal(byAmounts(['ev', 4000], ['ana', 3000]), 9000, 'EUR', members)).toBe(
      'EUR 20.00 is left to split.',
    );
    expect(splitRefusal(byAmounts(['ev', 6000], ['ana', 4000]), 9000, 'EUR', members)).toBe(
      'The amounts are EUR 10.00 more than the cost.',
    );
  });

  it('refuses nobody, a stranger, someone twice, mixed rows, a negative or fractional amount', () => {
    expect(splitRefusal({ people: [] }, 9000, 'EUR', members)).toBe('Pick who it is for');
    expect(splitRefusal(equal('ev', 'ghost'), 9000, 'EUR', members)).toMatch(/on this trip/);
    expect(splitRefusal(equal('ev', 'ev'), 9000, 'EUR', members)).toBe('Evelina is in the split twice.');
    expect(
      splitRefusal(
        { people: [{ travellerId: 'ev', amount: 9000, coveredBy: null }, { travellerId: 'ana', amount: null, coveredBy: null }] },
        9000,
        'EUR',
        members,
      ),
    ).toMatch(/everyone an amount/);
    expect(splitRefusal(byAmounts(['ev', -1], ['ana', 9001]), 9000, 'EUR', members)).not.toBeNull();
    expect(splitRefusal(byAmounts(['ev', 4500.5], ['ana', 4499.5]), 9000, 'EUR', members)).not.toBeNull();
  });

  it('an override only on a child’s share, by an adult of the trip', () => {
    const withCover = (travellerId: string, coveredBy: string) => ({
      people: [
        { travellerId: 'ev', amount: null, coveredBy: null },
        { travellerId, amount: null, coveredBy },
      ],
    });
    expect(splitRefusal(withCover('mia', 'ana'), 9000, 'EUR', members)).toBeNull();
    // The covering adult need not be in the split.
    expect(splitRefusal({ people: [{ travellerId: 'mia', amount: null, coveredBy: 'ana' }] }, 9000, 'EUR', members)).toBeNull();
    expect(splitRefusal(withCover('ana', 'ev'), 9000, 'EUR', members)).toMatch(/Only a child’s share/);
    expect(splitRefusal(withCover('mia', 'leo'), 9000, 'EUR', members)).toMatch(/not an adult/);
    expect(splitRefusal(withCover('mia', 'ghost'), 9000, 'EUR', members)).toMatch(/must be on this trip/);
  });
});

describe('editing a split cost', () => {
  const saved = { priceCurrency: 'EUR' };
  const confirmed = (extra = {}) => ({ status: 'confirmed' as const, priceAmount: 9000, priceCurrency: 'EUR', ...extra });

  it('a booking not split is edited as before', () => {
    expect(bookingSplitEditRefusal(saved, { status: 'idea' }, { people: 0, mode: null })).toBeNull();
  });

  it('a split booking stays a booking with a price', () => {
    const split = { people: 3, mode: 'equal' as const };
    expect(bookingSplitEditRefusal(saved, confirmed({ status: 'idea' }), split)).toMatch(/stays a booking/);
    expect(bookingSplitEditRefusal(saved, confirmed({ priceAmount: null }), split)).toMatch(/keeps a price/);
    expect(bookingSplitEditRefusal(saved, confirmed({ status: 'cancelled' }), split)).toBeNull();
    expect(bookingSplitEditRefusal(saved, confirmed({ priceAmount: 12000 }), split)).toBeNull();
  });

  it('an equal split follows a new currency; one by amounts keeps its own', () => {
    const next = confirmed({ priceCurrency: 'BGN' });
    expect(bookingSplitEditRefusal(saved, next, { people: 2, mode: 'equal' })).toBeNull();
    expect(bookingSplitEditRefusal(saved, next, { people: 2, mode: 'amounts' })).toMatch(/stays in EUR/);
    expect(expenseSplitEditRefusal({ currency: 'EUR' }, { currency: 'BGN' }, { people: 2, mode: 'amounts' })).toMatch(
      /never converted/,
    );
    expect(expenseSplitEditRefusal({ currency: 'EUR' }, { currency: 'BGN' }, { people: 2, mode: 'equal' })).toBeNull();
  });

  it('warns, never refuses, when a new cost no longer matches a split by amounts', () => {
    expect(splitMismatchWarning({ mode: 'amounts', allocated: 9000 }, 10000, 'EUR')).toMatch(
      /EUR 10.00 will be not allocated/,
    );
    expect(splitMismatchWarning({ mode: 'amounts', allocated: 9000 }, 8000, 'EUR')).toMatch(/EUR 10.00 more/);
    expect(splitMismatchWarning({ mode: 'amounts', allocated: 9000 }, 9000, 'EUR')).toBeNull();
    expect(splitMismatchWarning({ mode: 'equal', allocated: 9000 }, 10000, 'EUR')).toBeNull();
  });
});

describe('leaving a trip with money on it (invariant I, §7)', () => {
  it('names every kind of record that holds them', () => {
    expect(holdsRefusal('Ana', { paid: 0, shares: 0, covers: 0 })).toBeNull();
    expect(holdsRefusal('Ana', { paid: 1, shares: 0, covers: 0 })).toBe(
      'Ana is the payer on 1 money record on this trip. Change those first — money history is never moved or deleted by itself.',
    );
    expect(holdsRefusal('Ana', { paid: 2, shares: 3, covers: 1 })).toBe(
      'Ana is the payer on 2 money records, in 3 splits and covering a child’s share on 1 cost on this trip. Change those first — money history is never moved or deleted by itself.',
    );
  });
});

describe('suggestions the person asks for', () => {
  it('who’s going: the members who go, in member order', () => {
    expect(whoIsGoing([ev, ana, mia], ['mia', 'ev']).map((m) => m.id)).toEqual(['ev', 'mia']);
    expect(whoIsGoing([ev, ana], [])).toEqual([]);
  });

  const museum: Pricing = {
    lines: [
      { label: 'Adult', quantity: 2, unitAmount: 4000, for: 'adult' },
      { label: 'Child', quantity: 1, unitAmount: 2000, for: 'child' },
    ],
  } as Pricing;

  it('fills each person’s rate by audience', () => {
    expect(fillFromPrices(museum, [ev, ana, mia], 10000, 'EUR')).toEqual({
      kind: 'amounts',
      amounts: [
        { travellerId: 'ev', amount: 4000 },
        { travellerId: 'ana', amount: 4000 },
        { travellerId: 'mia', amount: 2000 },
      ],
    });
  });

  it('divides a group price or an extra equally among those ticked', () => {
    const withSled: Pricing = {
      lines: [...museum.lines, { label: 'Sled', quantity: 1, unitAmount: 1001, extra: true }],
    } as Pricing;
    expect(fillFromPrices(withSled, [ev, ana, mia], 11001, 'EUR')).toEqual({
      kind: 'amounts',
      amounts: [
        { travellerId: 'ev', amount: 4334 },
        { travellerId: 'ana', amount: 4334 },
        { travellerId: 'mia', amount: 2333 },
      ],
    });
    const family: Pricing = { lines: [{ label: 'Family', quantity: 1, unitAmount: 12000, group: true }] } as Pricing;
    expect(fillFromPrices(family, [ev, mia], 12000, 'EUR')).toMatchObject({
      amounts: [{ amount: 6000 }, { amount: 6000 }],
    });
  });

  it('refuses, with why, when the people ticked do not match the price', () => {
    expect(fillFromPrices(museum, [ev, mia], 10000, 'EUR')).toEqual({
      kind: 'refused',
      reason:
        'The rates for the people ticked add up to EUR 60.00, not the price EUR 100.00. Check who is ticked, or split by amounts.',
    });
    // Nobody not specified is assumed adult: there is no Anyone rate for Sam.
    expect(fillFromPrices(museum, [ev, ana, sam], 10000, 'EUR')).toMatchObject({ kind: 'refused' });
    expect(fillFromPrices(museum, [], 10000, 'EUR')).toMatchObject({ kind: 'refused' });
    const untagged: Pricing = {
      lines: [
        { label: 'A', quantity: 1, unitAmount: 100 },
        { label: 'B', quantity: 1, unitAmount: 200 },
      ],
    } as Pricing;
    expect(fillFromPrices(untagged, [ev, ana], 300, 'EUR')).toMatchObject({ kind: 'refused' });
  });

  it('one untagged rate is for anyone', () => {
    const one: Pricing = { lines: [{ label: 'Ticket', quantity: 3, unitAmount: 1500 }] } as Pricing;
    expect(fillFromPrices(one, [ev, mia, sam], 4500, 'EUR')).toMatchObject({
      amounts: [{ amount: 1500 }, { amount: 1500 }, { amount: 1500 }],
    });
  });
});

describe('reading a split', () => {
  const nameOf = (id: string) => members.get(id)?.name ?? 'Someone';

  it('says who covers a child’s share, and nothing for one’s own', () => {
    expect(coverText({ kind: 'own' }, nameOf)).toBeNull();
    expect(coverText({ kind: 'notCovered' }, nameOf)).toBe('not covered');
    expect(coverText({ kind: 'covered', adultIds: ['ev'], source: 'trip' }, nameOf)).toBe('covered by Evelina');
    expect(coverText({ kind: 'covered', adultIds: ['ev', 'ana'], source: 'trip' }, nameOf)).toBe(
      'covered by Evelina and Ana',
    );
  });

  it('names the split a deletion takes with it', () => {
    expect(splitGoesText(0)).toBeNull();
    expect(splitGoesText(1)).toBe('Its split between 1 person goes too.');
    expect(splitGoesText(3)).toBe('Its split between 3 people goes too.');
  });
});
