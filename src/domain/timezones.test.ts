import { TZDate } from '@date-fns/tz';

import {
  isKnownTimezone,
  isResolvableTimezone,
  searchTimezones,
  TIMEZONES,
  timezoneCountry,
  timezoneLabel,
  timezoneMatch,
  withZone,
} from './timezones';

describe('timezones', () => {
  it('has no duplicates', () => {
    expect(new Set(TIMEZONES).size).toBe(TIMEZONES.length);
  });

  it('contains only zones the date library can actually resolve', () => {
    // A bad IANA id would silently fall back and corrupt every instant derived from it.
    for (const tz of TIMEZONES) {
      const resolved = new TZDate(2026, 6, 1, 12, 0, tz);
      expect(Number.isNaN(resolved.getTime())).toBe(false);
    }
  });

  it('covers the zones the sample trips need', () => {
    for (const tz of ['Europe/Sofia', 'Europe/Rome', 'Europe/Helsinki']) {
      expect(isKnownTimezone(tz)).toBe(true);
    }
  });

  it('labels readably', () => {
    expect(timezoneLabel('Europe/Sofia')).toBe('Sofia');
    expect(timezoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  it('searches case-insensitively and across underscores', () => {
    expect(searchTimezones('sofia')).toEqual(['Europe/Sofia']);
    expect(searchTimezones('buenos aires')).toContain('America/Argentina/Buenos_Aires');
    expect(searchTimezones('')).toBe(TIMEZONES);
  });
});

describe('searching by country and city', () => {
  it('finds Rome time for Milan and for Italy', () => {
    expect(searchTimezones('milan')).toEqual(['Europe/Rome']);
    expect(searchTimezones('Italy')).toEqual(['Europe/Rome']);
  });

  it('says which place matched, unless the zone matched by its own name', () => {
    expect(timezoneMatch('Europe/Rome', 'milan')).toBe('Milan');
    expect(timezoneMatch('Europe/Rome', 'rome')).toBeNull();
    expect(timezoneMatch('Europe/Rome', '')).toBeNull();
  });

  it('lists every zone a country spans', () => {
    expect(searchTimezones('australia')).toHaveLength(5);
    expect(searchTimezones('indonesia')).toEqual(['Asia/Jakarta', 'Asia/Makassar']);
  });

  it('puts a place in the zone whose clock it keeps, not its capital', () => {
    expect(searchTimezones('bali')).toEqual(['Asia/Makassar']);
    expect(searchTimezones('tenerife')).toEqual(['Atlantic/Canary']);
  });

  it('finds accented places by either spelling', () => {
    expect(searchTimezones('krakow')).toEqual(['Europe/Warsaw']);
    expect(searchTimezones('kraków')).toEqual(['Europe/Warsaw']);
  });

  it('names the country of a zone', () => {
    expect(timezoneCountry('Europe/Rome')).toBe('Italy');
    expect(timezoneCountry('UTC')).toBeNull();
    expect(timezoneCountry('Europe/Andorra')).toBeNull();
  });

  it('gives every zone but UTC at least its country', () => {
    expect(TIMEZONES.filter((tz) => timezoneCountry(tz) === null)).toEqual(['UTC']);
  });
});

describe('isResolvableTimezone', () => {
  it('accepts a valid zone that is not in the curated picker list', () => {
    expect(isKnownTimezone('Europe/Andorra')).toBe(false);
    expect(isResolvableTimezone('Europe/Andorra')).toBe(true);
  });

  it('rejects nonsense and empty input', () => {
    expect(isResolvableTimezone('Mars/Olympus')).toBe(false);
    expect(isResolvableTimezone('')).toBe(false);
  });
});

describe('withZone', () => {
  it('names the zone a moment states for itself', () => {
    expect(withZone('Sunday, 20 September · 16:50', 'Europe/Sofia')).toBe(
      'Sunday, 20 September · 16:50 · Sofia',
    );
  });

  it('leaves a moment that follows the trip as it is', () => {
    expect(withZone('Sunday, 20 September · 14:00', null)).toBe('Sunday, 20 September · 14:00');
  });
});
