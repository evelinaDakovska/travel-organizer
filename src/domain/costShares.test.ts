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
  goneFromDraft,
  keptBasis,
  splitDraftConflicts,
  splitMismatchWarning,
  splitMode,
  splitRefusal,
  splitGoesText,
  splitSummary,
  whoIsGoing,
  type Member,
  type SplitBasis,
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
    expect(splitRefusal(byAmounts(['ev', -1], ['ana', 9001]), 9000, 'EUR', members)).toBe(
      'An amount cannot be below zero.',
    );
    expect(splitRefusal(byAmounts(['ev', 4500.5], ['ana', 4499.5]), 9000, 'EUR', members)).toBe('Use whole cents.');
    // An empty amount box (found on the emulator): words, not a type error.
    expect(splitRefusal(byAmounts(['ev', Number.NaN], ['ana', 9000]), 9000, 'EUR', members)).toBe(
      'Give everyone an amount, or split it equally.',
    );
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
      /EUR 10.00 will be left unallocated/,
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

});

describe('fill from prices: only rates marked Adult, Child or Anyone (3D-2 corrective)', () => {
  const unmarked =
    'A rate on this price is not marked Adult, Child or Anyone, so who it is for is not known. Mark it on the booking’s price, or split equally or by amounts here.';
  const priced = (...lines: object[]) => ({ mode: 'perPerson', lines }) as Pricing;

  it('1. refuses a single unmarked legacy rate — never taken for Anyone', () => {
    const one = priced({ label: 'Ticket', quantity: 3, unitAmount: 1500 });
    expect(fillFromPrices(one, [ev, mia, sam], 4500, 'EUR')).toEqual({ kind: 'refused', reason: unmarked });
    // A label that reads *Adult* is free text, never parsed (3C).
    const labelled = priced({ label: 'Adult', quantity: 2, unitAmount: 4000 });
    expect(fillFromPrices(labelled, [ev, ana], 8000, 'EUR')).toEqual({ kind: 'refused', reason: unmarked });
  });

  it('2. refuses several unmarked rates', () => {
    const two = priced({ label: 'Adult', quantity: 2, unitAmount: 4000 }, { label: 'Child', quantity: 1, unitAmount: 2000 });
    expect(fillFromPrices(two, [ev, ana, mia], 10000, 'EUR')).toEqual({ kind: 'refused', reason: unmarked });
  });

  it('3. fills an explicit Anyone rate for adults, children and people not specified', () => {
    const any = priced({ label: 'Ticket', quantity: 3, unitAmount: 1500, for: 'any' });
    expect(fillFromPrices(any, [ev, mia, sam], 4500, 'EUR')).toEqual({
      kind: 'amounts',
      amounts: [
        { travellerId: 'ev', amount: 1500 },
        { travellerId: 'mia', amount: 1500 },
        { travellerId: 'sam', amount: 1500 },
      ],
    });
  });

  it('4. fills explicit Adult and Child rates, with Anyone for the rest', () => {
    const three = priced(
      { quantity: 1, unitAmount: 4000, for: 'adult' },
      { quantity: 1, unitAmount: 2000, for: 'child' },
      { quantity: 1, unitAmount: 3000, for: 'any' },
    );
    expect(fillFromPrices(three, [ev, mia, sam], 9000, 'EUR')).toMatchObject({
      amounts: [{ amount: 4000 }, { amount: 2000 }, { amount: 3000 }],
    });
  });

  it('5. refuses marked and unmarked rates together, whichever comes first', () => {
    const adult = { quantity: 2, unitAmount: 4000, for: 'adult' };
    const ticket = { label: 'Ticket', quantity: 1, unitAmount: 2000 };
    expect(fillFromPrices(priced(adult, ticket), [ev, ana, mia], 10000, 'EUR')).toEqual({ kind: 'refused', reason: unmarked });
    expect(fillFromPrices(priced(ticket, adult), [ev, ana, mia], 10000, 'EUR')).toEqual({ kind: 'refused', reason: unmarked });
  });

  it('6. group prices and extras are divided equally as before, and need no mark', () => {
    const family = priced({ label: 'Family', quantity: 1, unitAmount: 12000, group: true });
    expect(fillFromPrices(family, [ev, mia], 12000, 'EUR')).toMatchObject({ amounts: [{ amount: 6000 }, { amount: 6000 }] });
    const extras = priced(
      { quantity: 1, unitAmount: 4000, for: 'adult' },
      { label: 'Sled', quantity: 1, unitAmount: 1001, extra: true },
      { label: 'Cabin', quantity: 1, unitAmount: 2000, group: true },
    );
    expect(fillFromPrices(extras, [ev, ana], 11001, 'EUR')).toMatchObject({
      amounts: [{ amount: 4000 + 1501 }, { amount: 4000 + 1500 }],
    });
    // An unmarked person rate beside them still refuses.
    const withTicket = priced({ label: 'Ticket', quantity: 1, unitAmount: 1000 }, { label: 'Sled', quantity: 1, unitAmount: 1000, extra: true });
    expect(fillFromPrices(withTicket, [ev], 2000, 'EUR')).toEqual({ kind: 'refused', reason: unmarked });
  });

  it('7. refuses a missing or an ambiguous audience, saying which', () => {
    const adultsOnly = priced({ quantity: 2, unitAmount: 4000, for: 'adult' });
    expect(fillFromPrices(adultsOnly, [ev, mia], 8000, 'EUR')).toEqual({
      kind: 'refused',
      reason: 'There is no rate for everyone ticked. Split by amounts instead.',
    });
    expect(fillFromPrices(adultsOnly, [ev, sam], 8000, 'EUR')).toMatchObject({ kind: 'refused' });
    const twice = priced({ quantity: 1, unitAmount: 4000, for: 'adult' }, { quantity: 1, unitAmount: 3500, for: 'adult' });
    expect(fillFromPrices(twice, [ev, ana], 7500, 'EUR')).toEqual({
      kind: 'refused',
      reason: 'Two rates on this price are marked Adult, so which one applies is not known. Split equally or by amounts instead.',
    });
  });

  it('8. a refused fill changes nothing it was given', () => {
    const lines = [{ label: 'Ticket', quantity: 3, unitAmount: 1500 }];
    const pricing = priced(...lines);
    const before = JSON.stringify(pricing);
    const people = [ev, mia, sam];
    Object.freeze(pricing);
    pricing.lines.forEach((line) => Object.freeze(line));
    Object.freeze(people);
    expect(fillFromPrices(pricing, people, 4500, 'EUR')).toMatchObject({ kind: 'refused' });
    expect(JSON.stringify(pricing)).toBe(before);
    // An equal split or amounts typed by hand stay open for the same people.
    expect(splitRefusal(equal('ev', 'mia', 'sam'), 4500, 'EUR', members)).toBeNull();
    expect(splitRefusal(byAmounts(['ev', 2000], ['mia', 1000], ['sam', 1500]), 4500, 'EUR', members)).toBeNull();
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

describe('a split draft and the data under it (3D-2 corrective)', () => {
  const basis = (extra: Partial<SplitBasis> = {}): SplitBasis => ({
    total: 9000,
    currency: 'EUR',
    members: [ev, ana, mia, leo],
    shares: [],
    ...extra,
  });
  const draft = (...ids: string[]) => ids.map((travellerId) => ({ travellerId, coveredBy: null }));

  it('1. the cost changing is always said', () => {
    expect(splitDraftConflicts(basis(), basis({ total: 12000 }), draft('ev'))).toEqual([
      'The cost is now EUR 120.00, not EUR 90.00.',
    ]);
    expect(splitDraftConflicts(basis(), basis({ total: 0, currency: '' }), draft('ev'))).toEqual([
      'The cost has no price now.',
    ]);
  });

  it('2. the currency changing is always said, even at the same amount', () => {
    expect(splitDraftConflicts(basis(), basis({ currency: 'BGN' }), [])).toEqual([
      'The cost is now BGN 90.00, not EUR 90.00.',
    ]);
  });

  it('3. anyone leaving the trip is said; someone in the draft or covering in it, with what to do', () => {
    const gone = basis({ members: [ev, ana, mia] });
    expect(splitDraftConflicts(basis(), gone, draft('ev', 'leo'))).toEqual([
      'Leo is no longer on this trip but is still in this split. Take them out, or start again from the saved split.',
    ]);
    expect(splitDraftConflicts(basis(), gone, draft('ev', 'ana'))).toEqual(['Leo is no longer on this trip.']);
    const anaGone = basis({ members: [ev, mia, leo] });
    expect(splitDraftConflicts(basis(), anaGone, [{ travellerId: 'mia', coveredBy: 'ana' }])).toEqual([
      'Ana covers Mia here and is no longer on this trip. Take them out to choose again, or start again from the saved split.',
    ]);
  });

  it('4. adult or child changing for someone the draft names is said', () => {
    const grown = basis({ members: [ev, ana, { ...mia, classification: 'adult' }, leo] });
    expect(splitDraftConflicts(basis(), grown, draft('mia'))).toEqual(['Mia is now an adult on this trip.']);
    const anaChild = basis({ members: [ev, { ...ana, classification: 'child' }, mia, leo] });
    expect(splitDraftConflicts(basis(), anaChild, [{ travellerId: 'mia', coveredBy: 'ana' }])).toEqual([
      'Ana is now a child on this trip.',
    ]);
    expect(splitDraftConflicts(basis(), grown, draft('ev'))).toEqual([]);
  });

  it('5. the trip’s Covered by changing is not a conflict: it is shown live and never saved with a split', () => {
    // The basis does not carry it at all; a draft over the same cost, people and split is unchanged.
    expect(splitDraftConflicts(basis(), basis(), draft('mia'))).toEqual([]);
  });

  it('6. the saved split changing elsewhere is said; the same split saved again under new ids is not', () => {
    const saved = basis({ shares: shares(['ev', null], ['ana', null]) });
    const other = basis({ shares: shares(['ev', 5000], ['ana', 4000]) });
    expect(splitDraftConflicts(saved, other, draft('ev'))).toEqual(['The saved split was changed somewhere else.']);
    expect(splitDraftConflicts(saved, basis(), draft('ev'))).toEqual(['The saved split was changed somewhere else.']);
    const override = basis({ shares: [{ travellerId: 'mia', amount: null, coveredBy: 'ana', sortOrder: 0 }] });
    expect(splitDraftConflicts(basis({ shares: shares(['mia', null]) }), override, draft('mia'))).toEqual([
      'The saved split was changed somewhere else.',
    ]);
    expect(splitDraftConflicts(saved, basis({ shares: shares(['ev', null], ['ana', null]) }), draft('ev'))).toEqual([]);
  });

  it('7. a harmless refresh — a name, someone joining — is no conflict', () => {
    const renamed = basis({ members: [{ ...ev, name: 'Eve' }, ana, mia, leo, sam] });
    expect(splitDraftConflicts(basis(), renamed, draft('ev', 'mia'))).toEqual([]);
  });

  it('8. several changes are all said, in order', () => {
    const many = basis({ total: 10000, members: [ev, ana], shares: shares(['ev', null]) });
    expect(splitDraftConflicts(basis(), many, draft('ev', 'mia'))).toEqual([
      'The cost is now EUR 100.00, not EUR 90.00.',
      'Mia is no longer on this trip but is still in this split. Take them out, or start again from the saved split.',
      'Leo is no longer on this trip.',
      'The saved split was changed somewhere else.',
    ]);
  });

  it('9. nothing changed: no conflict', () => {
    expect(splitDraftConflicts(basis(), basis(), draft('ev', 'ana', 'mia'))).toEqual([]);
  });
});

describe('keeping my changes never drops anyone (3D-2 final corrective)', () => {
  const basis = (members: Member[], extra: Partial<SplitBasis> = {}): SplitBasis => ({
    total: 9000,
    currency: 'EUR',
    members,
    shares: [],
    ...extra,
  });
  const seen = basis([ev, ana, mia, leo]);
  const draft = (...ids: string[]) => ids.map((travellerId) => ({ travellerId, coveredBy: null }));

  it('someone in the draft who left stays in what was kept, so the conflict stays', () => {
    const now = basis([ev, ana, mia]);
    const kept = keptBasis(seen, now, draft('ev', 'leo'));
    expect(kept.members.map((m) => m.id)).toEqual(['ev', 'ana', 'mia', 'leo']);
    expect(goneFromDraft(seen, now, draft('ev', 'leo'))).toEqual([leo]);
    // Kept again and again: still said, whether the draft still names Leo or not.
    expect(splitDraftConflicts(kept, now, draft('ev', 'leo'))).toEqual([
      'Leo is no longer on this trip but is still in this split. Take them out, or start again from the saved split.',
    ]);
    expect(splitDraftConflicts(kept, now, draft('ev'))).toEqual(['Leo is no longer on this trip.']);
    expect(splitDraftConflicts(keptBasis(kept, now, draft('ev', 'leo')), now, draft('ev', 'leo'))).toHaveLength(1);
  });

  it('taking them out is the person’s step: then nothing is left to say', () => {
    const now = basis([ev, ana, mia]);
    const kept = keptBasis(seen, now, draft('ev', 'leo'));
    const takenOut = { ...kept, members: kept.members.filter((m) => m.id !== 'leo') };
    expect(splitDraftConflicts(takenOut, now, draft('ev'))).toEqual([]);
  });

  it('someone who left and is not in the draft is dropped by Keep, with nothing to take out', () => {
    const now = basis([ev, ana, mia]);
    expect(goneFromDraft(seen, now, draft('ev', 'ana'))).toEqual([]);
    expect(splitDraftConflicts(keptBasis(seen, now, draft('ev', 'ana')), now, draft('ev', 'ana'))).toEqual([]);
  });

  it('an adult covering a child in the draft who left stays until taken out; the cover is never swapped', () => {
    const now = basis([ev, mia, leo]);
    const covering = [{ travellerId: 'mia', coveredBy: 'ana' }];
    expect(goneFromDraft(seen, now, covering)).toEqual([ana]);
    const kept = keptBasis(seen, now, covering);
    expect(splitDraftConflicts(kept, now, covering)).toHaveLength(1);
    // Clearing the cover alone, without taking Ana out of what was seen, is still refused.
    expect(splitDraftConflicts(kept, now, draft('mia'))).toEqual(['Ana is no longer on this trip.']);
  });

  it('someone named whom neither the draft’s data nor the trip has is never saved quietly', () => {
    expect(splitDraftConflicts(seen, seen, draft('ev', 'ghost'))).toEqual(['Someone in this split is not on this trip.']);
  });

  it('a harmless refresh — a rename, someone joining — still keeps without a word', () => {
    const now = basis([{ ...ev, name: 'Eve' }, ana, mia, leo, sam]);
    expect(splitDraftConflicts(seen, now, draft('ev', 'mia'))).toEqual([]);
    expect(keptBasis(seen, now, draft('ev', 'mia'))).toEqual(now);
  });
});
