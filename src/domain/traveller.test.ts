import {
  legacyNames,
  namesLine,
  parseTravellerRow,
  travellerNameSchema,
  tripPeopleLine,
  usesText,
  type Traveller,
} from './traveller';

const profile = (id: string, name: string): Traveller => ({
  id,
  name,
  sortOrder: 0,
  classification: 'unspecified',
});

describe('namesLine', () => {
  it('reads like a sentence', () => {
    expect(namesLine([])).toBe('');
    expect(namesLine([{ name: 'Evelina' }])).toBe('Evelina');
    expect(namesLine([{ name: 'Evelina' }, { name: 'Ana' }])).toBe('Evelina and Ana');
    expect(namesLine([{ name: 'Evelina' }, { name: 'Ana' }, { name: 'Мия' }])).toBe(
      'Evelina, Ana and Мия',
    );
  });
});

describe('travellerNameSchema', () => {
  it('trims, and refuses an empty or very long name', () => {
    expect(travellerNameSchema.parse('  Ana ')).toBe('Ana');
    expect(travellerNameSchema.safeParse('   ').success).toBe(false);
    expect(travellerNameSchema.safeParse('x'.repeat(61)).success).toBe(false);
  });
});

describe('legacyNames (FB-12)', () => {
  const profiles = [profile('p1', 'Evelina'), profile('p2', 'Ana Petrova')];

  it('offers the profile with exactly the same name, ignoring case and spaces', () => {
    expect(legacyNames([' evelina '], [], profiles)).toEqual([
      { name: 'evelina', match: profiles[0], matches: [profiles[0]] },
    ]);
  });

  it('never matches on part of a name', () => {
    expect(legacyNames(['Ana'], [], profiles)).toEqual([{ name: 'Ana', match: null, matches: [] }]);
  });

  it('leaves out names already among the trip’s travellers, blanks and repeats', () => {
    expect(legacyNames(['Evelina', '', 'Mia', 'mia'], [{ name: 'Evelina' }], profiles)).toEqual([
      { name: 'Mia', match: null, matches: [] },
    ]);
  });

  it('excludes names that were already converted even if member was removed', () => {
    expect(legacyNames(['Evelina', 'Mia'], [], profiles, ['Evelina'])).toEqual([
      { name: 'Mia', match: null, matches: [] },
    ]);
  });

  it('provides all matching profiles when multiple share the same name', () => {
    const dupes = [profile('p1', 'Alex'), profile('p2', 'Alex')];
    const res = legacyNames(['Alex'], [], dupes);
    expect(res).toEqual([
      { name: 'Alex', match: dupes[0], matches: dupes },
    ]);
  });
});

describe('tripPeopleLine (C1)', () => {
  it('shows only profile members when all legacy names are converted or empty', () => {
    expect(tripPeopleLine([{ name: 'Ana' }, { name: 'Misho' }], ['Ana', 'Misho'])).toBe(
      'Ana and Misho',
    );
    expect(tripPeopleLine([{ name: 'Evelina' }], [])).toBe('Evelina');
  });

  it('excludes converted names even if they are not in current members', () => {
    expect(tripPeopleLine([], ['Ana', 'Misho'], ['Ana'])).toBe('Misho');
  });

  it('shows profile members plus unconverted legacy names (partial conversion)', () => {
    expect(
      tripPeopleLine([{ name: 'Ana' }], ['Ana', 'Misho', 'Mitko']),
    ).toBe('Ana, Misho and Mitko');
  });

  it('deduplicates case-insensitively and trims whitespace', () => {
    expect(
      tripPeopleLine(
        [{ name: 'Ana' }],
        ['  ana  ', '  Misho  ', 'misho', 'Mitko', '   '],
      ),
    ).toBe('Ana, Misho and Mitko');
  });

  it('shows all legacy names when no profiles are linked', () => {
    expect(tripPeopleLine([], ['Evelina', 'Sample Friend'])).toBe(
      'Evelina and Sample Friend',
    );
    expect(tripPeopleLine([], [])).toBe('');
  });

  it('preserves multiple profiles even if they share display names', () => {
    expect(
      tripPeopleLine([{ name: 'Alex' }, { name: 'Alex' }], ['Alex', 'Bob']),
    ).toBe('Alex, Alex and Bob');
  });
});

describe('parseTravellerRow', () => {
  it('keeps the name and classification as stored', () => {
    expect(
      parseTravellerRow({
        id: 'p1',
        name: 'Мия',
        sort_order: 2,
        created_at: 'x',
        updated_at: 'x',
      }),
    ).toEqual({ id: 'p1', name: 'Мия', sortOrder: 2, classification: 'unspecified' });

    expect(
      parseTravellerRow({
        id: 'p2',
        name: 'Adult Person',
        sort_order: 0,
        classification: 'adult',
        created_at: 'x',
        updated_at: 'x',
      }),
    ).toEqual({ id: 'p2', name: 'Adult Person', sortOrder: 0, classification: 'adult' });

    expect(
      parseTravellerRow({
        id: 'p3',
        name: 'Child Person',
        sort_order: 1,
        classification: 'child',
        created_at: 'x',
        updated_at: 'x',
      }),
    ).toEqual({ id: 'p3', name: 'Child Person', sortOrder: 1, classification: 'child' });
  });
});

describe('usesText', () => {
  it('says where a profile is used, or nothing when it is not', () => {
    expect(usesText({ trips: ['Lapland', 'Milan'], items: 2 })).toBe(
      'Goes on Lapland and Milan, and is on 2 bookings',
    );
    expect(usesText({ trips: [], items: 1 })).toBe('Is on 1 booking');
    expect(usesText({ trips: [], items: 0 })).toBeNull();
  });
});
