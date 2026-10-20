import {
  duplicateRule,
  findActivityDuplicates,
  normaliseTitle,
  type DuplicateFacts,
} from './activityDuplicates';

const facts = (extra: Partial<DuplicateFacts>): DuplicateFacts => ({
  title: 'Husky safari',
  status: 'idea',
  start: null,
  locationName: null,
  latitude: null,
  longitude: null,
  ...extra,
});

describe('normaliseTitle', () => {
  it('ignores case, accents, punctuation and spacing — and nothing more', () => {
    expect(normaliseTitle('  Café   de Flore! ')).toBe('cafe de flore');
    expect(normaliseTitle('CAFE DE FLORE')).toBe('cafe de flore');
    expect(normaliseTitle('Sierijärvi—husky')).toBe('sierijarvi husky');
    expect(normaliseTitle('Duomo tour')).not.toBe(normaliseTitle('Duomo'));
    expect(normaliseTitle('Москва')).toBe('москва');
  });
});

describe('duplicateRule', () => {
  it('flags the same title on the same day (scenario: exact duplicate)', () => {
    const a = facts({ start: '2026-11-21T13:00', status: 'confirmed' });
    expect(duplicateRule(a, facts({ start: '2026-11-21T13:00', status: 'confirmed' }))).toBe('title');
    expect(duplicateRule(a, facts({ title: 'husky  SAFARI', start: '2026-11-21' }))).toBe('title');
  });

  it('does not flag the same title on another day, or at another time that day', () => {
    expect(duplicateRule(facts({ start: '2026-11-21' }), facts({ start: '2026-11-22' }))).toBeNull();
    expect(duplicateRule(facts({ start: '2026-11-21T09:00' }), facts({ start: '2026-11-21T15:00' }))).toBeNull();
  });

  it('flags the same title when either has no date — planning a saved idea', () => {
    expect(duplicateRule(facts({}), facts({}))).toBe('title');
    expect(duplicateRule(facts({ start: '2026-11-21' }), facts({}))).toBe('title');
  });

  it('does not flag the same title at clearly different places', () => {
    const helsinki = facts({ locationName: 'Helsinki branch', latitude: 60.17, longitude: 24.94 });
    const rovaniemi = facts({ locationName: 'Rovaniemi branch', latitude: 66.5, longitude: 25.7 });
    expect(duplicateRule(helsinki, rovaniemi)).toBeNull();
    expect(duplicateRule(facts({ locationName: 'Bearhill' }), facts({ locationName: 'Husky Point' }))).toBeNull();
    // Unknown never contradicts.
    expect(duplicateRule(facts({ locationName: 'Bearhill' }), facts({}))).toBe('title');
  });

  it('flags a different title only at the same place and the same start time', () => {
    const lunch = facts({ title: 'Lunch', locationName: 'Nili', start: '2026-11-21T13:00' });
    expect(duplicateRule(lunch, facts({ title: 'Reindeer at Nili', locationName: 'NILI', start: '2026-11-21T13:00' }))).toBe('place');
    // Same place, same day, no matching time: two different visits.
    expect(duplicateRule(lunch, facts({ title: 'Dinner', locationName: 'Nili', start: '2026-11-21T19:00' }))).toBeNull();
    expect(duplicateRule(facts({ title: 'Lunch', locationName: 'Nili', start: '2026-11-21' }), facts({ title: 'Dinner', locationName: 'Nili', start: '2026-11-21' }))).toBeNull();
    // Same day and time, different places.
    expect(duplicateRule(lunch, facts({ title: 'Museum', locationName: 'Arktikum', start: '2026-11-21T13:00' }))).toBeNull();
  });

  it('measures coordinates: within 100 m is the same place', () => {
    const at = (lat: number, lng: number, title: string) => facts({ title, latitude: lat, longitude: lng, start: '2026-11-21T10:00' });
    expect(duplicateRule(at(66.5115, 25.7311, 'Arktikum'), at(66.5120, 25.7315, 'Science centre'))).toBe('place'); // ~60 m
    expect(duplicateRule(at(66.5115, 25.7311, 'Arktikum'), at(66.5135, 25.7311, 'Pilke'))).toBeNull(); // ~220 m
  });

  it('does not mistake similar names for the same (no false positive)', () => {
    for (const other of ['Husky safari (short)', 'Night husky safari', 'Husky farm visit', 'Reindeer safari']) {
      expect(duplicateRule(facts({ start: '2026-11-21' }), facts({ title: other, start: '2026-11-21' }))).toBeNull();
    }
  });
});

describe('findActivityDuplicates', () => {
  const existing = [
    facts({ title: 'Husky safari', start: '2026-11-21T13:00', status: 'confirmed' }),
    facts({ title: 'Old dinner', status: 'cancelled', start: '2026-11-22' }),
  ];

  it('names the item it matches and why, including a cancelled one', () => {
    const [match, cancelled] = findActivityDuplicates(
      [facts({ start: '2026-11-21T13:00' }), facts({ title: 'old dinner', start: '2026-11-22' })],
      existing,
    );
    expect(match).toEqual({ source: 'existing', otherTitle: 'Husky safari', reason: 'Same title as “Husky safari” (Sat 21 Nov, 13:00)' });
    expect(cancelled?.reason).toBe('Same title as “Old dinner” (Sun 22 Nov, cancelled)');
  });

  it('flags a repeat inside the file, but not its first occurrence', () => {
    const result = findActivityDuplicates(
      [facts({ title: 'Arktikum' }), facts({ title: 'Santa Village' }), facts({ title: 'ARKTIKUM' })],
      [],
    );
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toEqual({ source: 'file', otherTitle: 'Arktikum', reason: 'Same title as “Arktikum” (no date, entry 1 in this file)' });
  });

  it('skips invalid entries on both sides', () => {
    expect(findActivityDuplicates([null, facts({ title: 'x' })], [])).toEqual([null, null]);
  });

  it('prefers a match in the trip over one in the file', () => {
    const result = findActivityDuplicates([facts({ start: '2026-11-21T13:00' }), facts({ start: '2026-11-21T13:00' })], existing);
    expect(result[1]?.source).toBe('existing');
  });
});
