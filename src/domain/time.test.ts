import {
  addCalendarDays,
  dayKey,
  isPastDate,
  isValidLocal,
  minutesUntil,
  shiftMoment,
  timeOfDay,
  toInstant,
} from './time';

const sofiaFlight = { local: '2026-09-19T06:10', tz: 'Europe/Sofia', precision: 'time' } as const;

describe('toInstant', () => {
  it('resolves a wall-clock time using its own zone, not the device zone', () => {
    // Sofia is UTC+3 in September (EEST).
    expect(toInstant(sofiaFlight)).toBe('2026-09-19T03:10:00.000Z');
  });

  it('resolves the same wall clock differently in a different zone', () => {
    expect(toInstant({ local: '2026-09-19T14:00', tz: 'Europe/Rome', precision: 'time' }))
      .toBe('2026-09-19T12:00:00.000Z');
  });

  it('handles a spring-forward boundary', () => {
    // London clocks jump 01:00 -> 02:00 on 2026-03-29.
    expect(toInstant({ local: '2026-03-29T00:30', tz: 'Europe/London', precision: 'time' }))
      .toBe('2026-03-29T00:30:00.000Z');
    expect(toInstant({ local: '2026-03-29T03:30', tz: 'Europe/London', precision: 'time' }))
      .toBe('2026-03-29T02:30:00.000Z');
  });

  it('handles an autumn-back boundary', () => {
    // Sofia clocks fall back on 2026-10-25.
    expect(toInstant({ local: '2026-10-24T12:00', tz: 'Europe/Sofia', precision: 'time' }))
      .toBe('2026-10-24T09:00:00.000Z');
    expect(toInstant({ local: '2026-10-26T12:00', tz: 'Europe/Sofia', precision: 'time' }))
      .toBe('2026-10-26T10:00:00.000Z');
  });

  it('resolves a date-only value to local midnight so it sorts to the top of its day', () => {
    expect(toInstant({ local: '2026-09-19', tz: 'Europe/Rome', precision: 'date' }))
      .toBe('2026-09-18T22:00:00.000Z');
  });

  it('keeps T00:00 distinct from date-only', () => {
    const midnight = { local: '2026-09-19T00:00', tz: 'Europe/Rome', precision: 'time' } as const;
    const dateOnly = { local: '2026-09-19', tz: 'Europe/Rome', precision: 'date' } as const;
    expect(toInstant(midnight)).toBe(toInstant(dateOnly));
    expect(timeOfDay(midnight)).toBe('00:00');
    expect(timeOfDay(dateOnly)).toBeNull();
  });

  it('rejects malformed values', () => {
    expect(() => toInstant({ local: '2026-09-19', tz: 'Europe/Rome', precision: 'time' })).toThrow();
    expect(() => toInstant({ local: '2026-02-30', tz: 'Europe/Rome', precision: 'date' })).toThrow();
    expect(() => toInstant({ local: '2026-09-19T25:00', tz: 'Europe/Rome', precision: 'time' })).toThrow();
  });
});

describe('addCalendarDays', () => {
  it('moves across month and year ends, and back', () => {
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('shiftMoment', () => {
  it('keeps the wall clock across a clock change, where 24 hours would not (A3)', () => {
    // 25 Oct 2026 is 25 hours long in Sofia.
    const evening = { local: '2026-10-24T20:00', tz: 'Europe/Sofia', precision: 'time' } as const;
    const next = shiftMoment(evening, 1);
    expect(next).toEqual({ ...evening, local: '2026-10-25T20:00' });
    const hours = (Date.parse(toInstant(next)) - Date.parse(toInstant(evening))) / 3_600_000;
    expect(hours).toBe(25);
  });

  it('shifts a date-only moment by its date', () => {
    const day = { local: '2026-03-29', tz: 'Europe/Sofia', precision: 'date' } as const;
    expect(shiftMoment(day, 1).local).toBe('2026-03-30');
  });
});

describe('dayKey', () => {
  it('groups a late-evening event onto its own local day, not the UTC one', () => {
    const lateNight = { local: '2026-09-19T23:30', tz: 'Europe/Sofia', precision: 'time' } as const;
    // The instant is already the 20th in UTC — grouping must not follow it.
    expect(toInstant(lateNight)).toBe('2026-09-19T20:30:00.000Z');
    expect(dayKey(lateNight)).toBe('2026-09-19');
  });

  it('groups an early-morning event onto its own local day', () => {
    // Auckland is UTC+12 on 19 Sep; NZDT does not begin until the 27th.
    const redEye = { local: '2026-09-19T00:30', tz: 'Pacific/Auckland', precision: 'time' } as const;
    expect(toInstant(redEye)).toBe('2026-09-18T12:30:00.000Z');
    expect(dayKey(redEye)).toBe('2026-09-19');
  });
});

describe('minutesUntil', () => {
  it('counts down to the true instant regardless of the device zone', () => {
    const now = new Date('2026-09-19T01:38:00.000Z');
    expect(minutesUntil(sofiaFlight, now)).toBe(92);
  });

  it('goes negative once passed', () => {
    expect(minutesUntil(sofiaFlight, new Date('2026-09-19T04:10:00.000Z'))).toBe(-60);
  });
});

describe('isPastDate', () => {
  it('is false on the last day of the trip', () => {
    expect(isPastDate('2026-09-22', new Date(2026, 8, 22, 23, 0))).toBe(false);
  });

  it('is true the following day', () => {
    expect(isPastDate('2026-09-22', new Date(2026, 8, 23, 1, 0))).toBe(true);
  });
});

describe('isValidLocal', () => {
  it('accepts well-formed values', () => {
    expect(isValidLocal('2026-09-19', 'date')).toBe(true);
    expect(isValidLocal('2026-09-19T06:10', 'time')).toBe(true);
    expect(isValidLocal('2028-02-29', 'date')).toBe(true);
  });

  it('rejects mismatched precision and impossible dates', () => {
    expect(isValidLocal('2026-09-19T06:10', 'date')).toBe(false);
    expect(isValidLocal('2026-09-19', 'time')).toBe(false);
    expect(isValidLocal('2026-02-30', 'date')).toBe(false);
    expect(isValidLocal('2026-13-01', 'date')).toBe(false);
  });
});
