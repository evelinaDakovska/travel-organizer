import {
  followStart,
  isValidSubkind,
  kindLabel,
  parseTripItemRow,
  routeLabel,
  transportDetails,
  tripItemFormValues,
  tripItemInputSchema,
  tripItemWriteValues,
  type TripItemInput,
  type TripItemRow,
  PRIORITIES,
  SUBKINDS,
  subkindLabel,
  subkindsFor,
  TRIP_ITEM_KINDS,
  TRIP_ITEM_STATUSES,
} from './tripItem';

describe('trip item enums', () => {
  it('does not include "place" as a kind — a place is status=idea', () => {
    expect(TRIP_ITEM_KINDS).not.toContain('place');
  });

  it('matches the kinds and statuses the schema CHECK constraints allow', () => {
    expect([...TRIP_ITEM_KINDS]).toEqual([
      'transport',
      'stay',
      'activity',
      'food',
      'task',
      'other',
    ]);
    expect([...TRIP_ITEM_STATUSES]).toEqual(['idea', 'confirmed', 'cancelled']);
    expect([...PRIORITIES]).toEqual(['must', 'want', 'maybe']);
  });
});

describe('subkinds', () => {
  it('covers every kind', () => {
    for (const kind of TRIP_ITEM_KINDS) {
      expect(subkindsFor(kind).length).toBeGreaterThan(0);
    }
  });

  it('carries transport modes, replacing a separate TransportMode concept', () => {
    for (const mode of ['flight', 'train', 'bus', 'ferry', 'car']) {
      expect(subkindsFor('transport')).toContain(mode);
    }
  });

  it('separates cafe from restaurant, which is why subkind exists', () => {
    expect(subkindsFor('food')).toContain('cafe');
    expect(subkindsFor('food')).toContain('restaurant');
  });

  it('has no duplicates within a kind', () => {
    for (const kind of TRIP_ITEM_KINDS) {
      const list = subkindsFor(kind);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('never uses "other" as a subkind value — absence means unspecified', () => {
    for (const kind of TRIP_ITEM_KINDS) {
      expect(subkindsFor(kind)).not.toContain('other');
    }
  });

  it('validates against the owning kind only', () => {
    expect(isValidSubkind('food', 'cafe')).toBe(true);
    expect(isValidSubkind('transport', 'cafe')).toBe(false);
    expect(isValidSubkind('food', 'nonsense')).toBe(false);
  });

  it('treats a null subkind as valid for every kind', () => {
    for (const kind of TRIP_ITEM_KINDS) {
      expect(isValidSubkind(kind, null)).toBe(true);
    }
  });

  it('labels readably', () => {
    expect(subkindLabel('check-in')).toBe('Check-in');
    expect(subkindLabel('cafe')).toBe('Cafe');
  });

  it('exposes SUBKINDS keyed by kind', () => {
    expect(Object.keys(SUBKINDS).sort()).toEqual([...TRIP_ITEM_KINDS].sort());
  });
});

const ROME = 'Europe/Rome';
const schema = tripItemInputSchema(ROME);

const parse = (input: unknown) => schema.safeParse(input);
const errorPaths = (result: ReturnType<typeof parse>) =>
  result.success ? [] : result.error.issues.map((i) => i.path.join('.'));

const valid = {
  kind: 'activity',
  title: 'Duomo Fast Track',
  start: { local: '2026-09-19T14:00' },
} as const;

describe('tripItemInputSchema', () => {
  it('accepts the minimum a real item needs', () => {
    const result = parse(valid);
    expect(result.success).toBe(true);
    expect(result.success && result.data.status).toBe('idea');
    expect(result.success && result.data.isPaid).toBe(false);
  });

  it('requires a title that is not just whitespace', () => {
    expect(errorPaths(parse({ ...valid, title: '   ' }))).toEqual(['title']);
  });

  it('rejects a subkind that belongs to a different kind', () => {
    expect(errorPaths(parse({ ...valid, subkind: 'flight' }))).toEqual(['subkind']);
    expect(parse({ ...valid, subkind: 'museum' }).success).toBe(true);
  });

  it('allows no subkind, since "other" is absence rather than a value', () => {
    expect(parse({ ...valid, subkind: null }).success).toBe(true);
  });

  it('rejects an end with no start, which would vanish from the timeline', () => {
    const orphan = { kind: 'stay', title: 'Hotel', end: { local: '2026-09-22T11:00' } };
    expect(errorPaths(parse(orphan))).toEqual(['start']);
  });

  it('rejects an end before its start', () => {
    const backwards = { ...valid, end: { local: '2026-09-19T13:00' } };
    expect(errorPaths(parse(backwards))).toEqual(['end']);
  });

  it('compares across zones rather than comparing the text', () => {
    // 09:00 in Tokyo is already over by 09:00 in Rome, despite reading as the same clock.
    const backwards = {
      ...valid,
      start: { local: '2026-09-19T09:00', tz: 'Europe/Rome' },
      end: { local: '2026-09-19T09:00', tz: 'Asia/Tokyo' },
    };
    expect(errorPaths(parse(backwards))).toEqual(['end']);
  });

  it('resolves an unqualified moment against the trip default when comparing', () => {
    // The end has no zone, so it means Rome — which is after the Tokyo start.
    const forwards = {
      ...valid,
      start: { local: '2026-09-19T09:00', tz: 'Asia/Tokyo' },
      end: { local: '2026-09-19T09:00' },
    };
    expect(parse(forwards).success).toBe(true);
  });

  it('rejects a malformed moment and an unresolvable zone', () => {
    expect(errorPaths(parse({ ...valid, start: { local: '19/09/2026' } }))).toEqual(['start.local']);
    expect(errorPaths(parse({ ...valid, start: { local: '2026-09-19', tz: 'Europe/Atlantis' } })))
      .toEqual(['start.tz']);
  });

  it('rejects a date that does not exist', () => {
    expect(errorPaths(parse({ ...valid, start: { local: '2026-02-30' } }))).toEqual(['start.local']);
  });

  it('requires a currency alongside a price', () => {
    expect(errorPaths(parse({ ...valid, priceAmount: 2500 }))).toEqual(['priceCurrency']);
    expect(parse({ ...valid, priceAmount: 2500, priceCurrency: 'EUR' }).success).toBe(true);
  });

  it('rejects a fractional price, because money is stored in minor units', () => {
    expect(errorPaths(parse({ ...valid, priceAmount: 25.5, priceCurrency: 'EUR' })))
      .toEqual(['priceAmount']);
  });

  it('rejects coordinates outside the world', () => {
    expect(errorPaths(parse({ ...valid, latitude: 91 }))).toEqual(['latitude']);
    expect(errorPaths(parse({ ...valid, longitude: -181 }))).toEqual(['longitude']);
  });
});

describe('tripItemWriteValues', () => {
  const values = (input: unknown) => tripItemWriteValues(schema.parse(input), ROME);

  it('derives the instant from the wall clock and the resolved zone', () => {
    expect(values(valid).start_utc).toBe('2026-09-19T12:00:00.000Z');
  });

  it('derives it from the item own zone when it overrides the trip default', () => {
    const sofia = { ...valid, start: { local: '2026-09-19T14:00', tz: 'Europe/Sofia' } };
    expect(values(sofia).start_utc).toBe('2026-09-19T11:00:00.000Z');
  });

  it('stores no zone when none was given, so the trip default stays authoritative', () => {
    expect(values(valid).start_tz).toBeNull();
  });

  it('reads precision off the shape of the text rather than trusting a caller', () => {
    expect(values(valid).start_precision).toBe('time');
    expect(values({ ...valid, start: { local: '2026-09-19' } }).start_precision).toBe('date');
  });

  it('resolves a date-only moment to local midnight so it sorts to the top of its day', () => {
    expect(values({ ...valid, start: { local: '2026-09-19' } }).start_utc)
      .toBe('2026-09-18T22:00:00.000Z');
  });

  it('leaves both instants null when the item has no dates', () => {
    const undated = values({ kind: 'food', title: 'That bakery' });
    expect([undated.start_utc, undated.end_utc, undated.start_local]).toEqual([null, null, null]);
  });

  it('serialises details and flattens isPaid to an integer', () => {
    const row = values({ ...valid, details: { seat: '12A' }, isPaid: true });
    expect(row.details).toBe('{"seat":"12A"}');
    expect(row.is_paid).toBe(1);
  });
});

const row: TripItemRow = {
  id: 'i1',
  trip_id: 't1',
  kind: 'stay',
  subkind: 'hotel',
  status: 'confirmed',
  priority: null,
  title: 'Hotel Milano',
  start_local: '2026-09-19T15:00',
  start_tz: null,
  start_precision: 'time',
  start_utc: '2026-09-19T13:00:00.000Z',
  end_local: '2026-09-22T11:00',
  end_tz: null,
  end_precision: 'time',
  end_utc: '2026-09-22T09:00:00.000Z',
  completed_at: null,
  location_name: 'Via Roma 1',
  address: null,
  latitude: null,
  longitude: null,
  confirmation_code: 'ABC123',
  notes: null,
  details: '{"room":"402"}',
  price_amount: 24000,
  price_currency: 'EUR',
  is_paid: 1,
  created_at: '2026-09-11T00:00:00.000Z',
  updated_at: '2026-09-11T00:00:00.000Z',
};

describe('parseTripItemRow', () => {
  it('fills an unqualified zone from the trip default', () => {
    const item = parseTripItemRow(row, ROME);
    expect(item.start).toEqual({ local: '2026-09-19T15:00', tz: ROME, precision: 'time' });
    expect(item.end?.tz).toBe(ROME);
  });

  it('keeps a zone the row states for itself', () => {
    const item = parseTripItemRow({ ...row, start_tz: 'Europe/Sofia' }, ROME);
    expect(item.start?.tz).toBe('Europe/Sofia');
  });

  it('leaves a moment null when the row has no date', () => {
    const item = parseTripItemRow({ ...row, end_local: null, end_precision: null }, ROME);
    expect(item.end).toBeNull();
  });

  it('turns the integer flag back into a boolean', () => {
    expect(parseTripItemRow(row, ROME).isPaid).toBe(true);
    expect(parseTripItemRow({ ...row, is_paid: 0 }, ROME).isPaid).toBe(false);
  });

  it('tolerates malformed details rather than breaking the item list', () => {
    expect(parseTripItemRow({ ...row, details: 'not json' }, ROME).details).toBeNull();
    expect(parseTripItemRow({ ...row, details: '[1,2]' }, ROME).details).toBeNull();
    expect(parseTripItemRow(row, ROME).details).toEqual({ room: '402' });
  });

  it('round-trips through write values without losing anything', () => {
    const input: TripItemInput = schema.parse({
      kind: 'stay',
      subkind: 'hotel',
      status: 'confirmed',
      title: 'Hotel Milano',
      start: { local: '2026-09-19T15:00' },
      end: { local: '2026-09-22T11:00' },
      priceAmount: 24000,
      priceCurrency: 'EUR',
      isPaid: true,
    });
    const written = tripItemWriteValues(input, ROME);
    const item = parseTripItemRow({ ...row, ...written }, ROME);

    expect(item.title).toBe('Hotel Milano');
    expect(item.start?.local).toBe('2026-09-19T15:00');
    expect(item.end?.local).toBe('2026-09-22T11:00');
    expect(item.priceAmount).toBe(24000);
    expect(item.isPaid).toBe(true);
  });
});

describe('transport details', () => {
  const flight = {
    kind: 'transport' as const,
    details: { from: 'Sofia', to: 'Bergamo', carrier: 'Wizz', number: 'W6 4315' },
  };

  it('reads the two endpoints a single location column cannot hold', () => {
    expect(transportDetails(flight)?.from).toBe('Sofia');
    expect(transportDetails(flight)?.to).toBe('Bergamo');
  });

  it('returns nothing for a kind that has no structured details', () => {
    expect(transportDetails({ kind: 'food', details: { from: 'Sofia' } })).toBeNull();
    expect(transportDetails({ kind: 'transport', details: null })).toBeNull();
  });

  it('renders the route the way the spec writes it', () => {
    expect(routeLabel(transportDetails(flight))).toBe('Sofia → Bergamo');
  });

  it('renders whichever end is known rather than nothing', () => {
    expect(routeLabel({ from: 'Sofia' })).toBe('Sofia');
    expect(routeLabel({ to: 'Bergamo' })).toBe('→ Bergamo');
    expect(routeLabel({})).toBeNull();
    expect(routeLabel(null)).toBeNull();
  });

  it('accepts transport details on a transport item and refuses them elsewhere', () => {
    const base = { title: 'Flight', start: { local: '2026-09-19T06:10' } };
    expect(schema.safeParse({ ...base, kind: 'transport', details: { from: 'Sofia' } }).success)
      .toBe(true);
    expect(
      errorPaths(
        schema.safeParse({ ...base, kind: 'transport', details: { from: 12 } }),
      ),
    ).toEqual(['details']);
  });
});

describe('tripItemFormValues', () => {
  const stored = (overrides: Partial<TripItemRow> = {}) =>
    parseTripItemRow({ ...row, ...overrides }, ROME);

  it('round-trips an edit without changing what was stored', () => {
    const values = tripItemFormValues(stored());
    const written = tripItemWriteValues(schema.parse(values), ROME);

    expect(written.start_local).toBe(row.start_local);
    expect(written.start_utc).toBe(row.start_utc);
    expect(written.subkind).toBe('hotel');
    expect(written.price_amount).toBe(24000);
  });

  it('leaves an inherited zone inherited, so the item still follows the trip', () => {
    const values = tripItemFormValues(stored({ start_tz: null }));

    expect(values.start?.tz).toBeUndefined();
    expect(tripItemWriteValues(schema.parse(values), ROME).start_tz).toBeNull();
  });

  it('keeps a zone the user chose, even when it matches the trip', () => {
    const values = tripItemFormValues(stored({ start_tz: ROME }));

    expect(values.start?.tz).toBe(ROME);
    expect(tripItemWriteValues(schema.parse(values), ROME).start_tz).toBe(ROME);
  });

  it('re-resolves an inherited moment when the trip moves to another zone', () => {
    const values = tripItemFormValues(stored({ start_tz: null }));
    const written = tripItemWriteValues(schema.parse(values), 'Europe/Sofia');

    // Same wall clock, one hour earlier in UTC.
    expect(written.start_local).toBe('2026-09-19T15:00');
    expect(written.start_utc).toBe('2026-09-19T12:00:00.000Z');
  });

  it('offers EUR for an item with no price, and stores no currency unless a price is added', () => {
    const values = tripItemFormValues(stored({ price_amount: null, price_currency: null }));
    expect(values.priceCurrency).toBe('EUR');

    const written = tripItemWriteValues(schema.parse(values), ROME);
    expect([written.price_amount, written.price_currency]).toEqual([null, null]);
  });

  it('keeps the currency a price was stored in', () => {
    const values = tripItemFormValues(stored({ price_amount: 900, price_currency: 'BGN' }));
    expect(tripItemWriteValues(schema.parse(values), ROME).price_currency).toBe('BGN');
  });
});

describe('kindLabel', () => {
  it('gives every kind wording a person would use', () => {
    expect(TRIP_ITEM_KINDS.map(kindLabel)).toEqual([
      'Travel',
      'Stay',
      'Activity',
      'Food',
      'To do',
      'Other',
    ]);
  });
});

describe('followStart', () => {
  it('moves an end on an earlier day to the start day, keeping its time and zone', () => {
    const end = { local: '2026-10-20T11:00', tz: 'Europe/Sofia' };
    expect(followStart({ local: '2026-10-22T15:00' }, end)).toEqual({
      local: '2026-10-22T11:00',
      tz: 'Europe/Sofia',
    });
  });

  it('leaves an end that is still on or after the start day alone', () => {
    const end = { local: '2026-10-23' };
    expect(followStart({ local: '2026-10-22T15:00' }, end)).toBe(end);
    expect(followStart({ local: '2026-10-23' }, end)).toBe(end);
  });

  it('never invents an end, and leaves one alone when the start is removed', () => {
    expect(followStart({ local: '2026-10-22' }, undefined)).toBeUndefined();
    const end = { local: '2026-10-20' };
    expect(followStart(undefined, end)).toBe(end);
  });
});
