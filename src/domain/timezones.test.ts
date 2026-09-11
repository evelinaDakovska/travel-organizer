import { TZDate } from '@date-fns/tz';

import {
  isKnownTimezone,
  isResolvableTimezone,
  searchTimezones,
  TIMEZONES,
  timezoneLabel,
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
