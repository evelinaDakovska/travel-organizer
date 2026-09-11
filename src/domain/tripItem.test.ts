import {
  isValidSubkind,
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
