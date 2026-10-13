import {
  legacyNames,
  namesLine,
  parseTravellerRow,
  travellerNameSchema,
  tripPeopleLine,
  usesText,
  type Traveller,
} from './traveller';

const profile = (id: string, name: string): Traveller => ({ id, name, sortOrder: 0 });

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
      { name: 'evelina', match: profiles[0] },
    ]);
  });

  it('never matches on part of a name', () => {
    expect(legacyNames(['Ana'], [], profiles)).toEqual([{ name: 'Ana', match: null }]);
  });

  it('leaves out names already among the trip’s travellers, blanks and repeats', () => {
    expect(legacyNames(['Evelina', '', 'Mia', 'mia'], [{ name: 'Evelina' }], profiles)).toEqual([
      { name: 'Mia', match: null },
    ]);
  });
});

describe('tripPeopleLine', () => {
  it('shows the trip’s travellers, or the names typed before there were any', () => {
    expect(tripPeopleLine([{ name: 'Evelina' }], ['Old', 'Names'])).toBe('Evelina');
    expect(tripPeopleLine([], ['Evelina', 'Sample Friend'])).toBe('Evelina and Sample Friend');
    expect(tripPeopleLine([], [])).toBe('');
  });
});

describe('parseTravellerRow', () => {
  it('keeps the name exactly as stored', () => {
    expect(
      parseTravellerRow({
        id: 'p1',
        name: 'Мия',
        sort_order: 2,
        created_at: 'x',
        updated_at: 'x',
      }),
    ).toEqual({ id: 'p1', name: 'Мия', sortOrder: 2 });
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
