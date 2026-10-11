import type { LocalMoment } from './time';
import {
  differentClock,
  durationText,
  mismatchText,
  zoneForPlace,
  zoneHint,
  zoneHintText,
  zoneMismatches,
  zoneSuggestion,
} from './zoneHints';

const HEL = 'Europe/Helsinki';

describe('zoneForPlace', () => {
  it('finds a city listed under its zone, and the zone own city', () => {
    expect(zoneForPlace('Munich')).toBe('Europe/Berlin');
    expect(zoneForPlace('Frankfurt')).toBe('Europe/Berlin');
    expect(zoneForPlace('Berlin')).toBe('Europe/Berlin');
    expect(zoneForPlace('Helsinki')).toBe(HEL);
    expect(zoneForPlace('Rovaniemi')).toBe(HEL);
  });

  it('ignores case, surrounding spaces and finds both spellings', () => {
    expect(zoneForPlace('  munich ')).toBe('Europe/Berlin');
    expect(zoneForPlace('Helsinki ')).toBe(HEL);
    expect(zoneForPlace('München')).toBe('Europe/Berlin');
  });

  it('matches whole names only, never part of one', () => {
    expect(zoneForPlace('Munich Airport')).toBeNull();
    expect(zoneForPlace('Mun')).toBeNull();
  });

  it('refuses a place that spans several zones, and anything unknown or empty', () => {
    expect(zoneForPlace('Australia')).toBeNull();
    expect(zoneForPlace('Atlantis')).toBeNull();
    expect(zoneForPlace('')).toBeNull();
    expect(zoneForPlace(null)).toBeNull();
  });
});

describe('differentClock', () => {
  it('is false for zones keeping the same clock, such as Sofia and Helsinki', () => {
    expect(differentClock('Europe/Sofia', HEL, '2026-11-20T06:30')).toBe(false);
    expect(differentClock(HEL, HEL, '2026-11-20T06:30')).toBe(false);
  });

  it('is true across an hour', () => {
    expect(differentClock('Europe/Berlin', HEL, '2026-11-20T09:00')).toBe(true);
  });

  it('is judged on the day, so the weeks when summer time differs count', () => {
    // London keeps UTC's clock in winter and is an hour ahead of it in summer.
    expect(differentClock('Europe/London', 'UTC', '2026-01-20T10:00')).toBe(false);
    expect(differentClock('Europe/London', 'UTC', '2026-07-20T10:00')).toBe(true);
    // Lisbon and London keep the same clock all year.
    expect(differentClock('Europe/Lisbon', 'Europe/London', '2026-07-20T10:00')).toBe(false);
  });
});

describe('zoneSuggestion', () => {
  it('suggests the city zone for a time with none of its own on another clock', () => {
    expect(zoneSuggestion('Munich', { local: '2026-11-20T09:00' }, HEL)).toBe('Europe/Berlin');
  });

  it('suggests nothing when the city keeps the trip clock', () => {
    expect(zoneSuggestion('Sofia', { local: '2026-11-20T06:30' }, HEL)).toBeNull();
  });

  it('leaves alone a time that already states a zone, even the trip own', () => {
    expect(zoneSuggestion('Munich', { local: '2026-11-20T09:00', tz: HEL }, HEL)).toBeNull();
    expect(
      zoneSuggestion('Munich', { local: '2026-11-20T09:00', tz: 'Europe/Berlin' }, HEL),
    ).toBeNull();
  });

  it('suggests nothing for a date without a time, an unknown city, or no moment', () => {
    expect(zoneSuggestion('Munich', { local: '2026-11-20' }, HEL)).toBeNull();
    expect(zoneSuggestion('Atlantis', { local: '2026-11-20T09:00' }, HEL)).toBeNull();
    expect(zoneSuggestion('Munich', undefined, HEL)).toBeNull();
  });
});

describe('zoneHint', () => {
  it('explains a zone that came from the city', () => {
    const hint = zoneHint('Munich ', { local: '2026-11-20T09:00', tz: 'Europe/Berlin' }, HEL);
    expect(hint).toEqual({ place: 'Munich', tz: 'Europe/Berlin', tripTz: HEL });
    expect(zoneHintText(hint!)).toBe(
      'Munich is on a different clock, so this time is in Berlin time.',
    );
  });

  it('has nothing to say once the time is pinned to the trip zone, or for an unrelated zone', () => {
    expect(zoneHint('Munich', { local: '2026-11-20T09:00', tz: HEL }, HEL)).toBeNull();
    expect(zoneHint('Munich', { local: '2026-11-20T09:00', tz: 'Europe/Paris' }, HEL)).toBeNull();
    expect(zoneHint('Munich', { local: '2026-11-20T09:00' }, HEL)).toBeNull();
  });
});

describe('zoneMismatches', () => {
  const at = (local: string, tz = HEL): LocalMoment => ({ local, tz, precision: 'time' });
  const leg = (start: string, end: string) => ({
    start: at(start),
    end: at(end),
    startTzOverride: null,
    endTzOverride: null,
  });

  it('finds a departure and an arrival read in the trip zone instead of the city', () => {
    // Shaped like a winter Lapland trip: Sofia -> Munich -> Helsinki, all saved without zones.
    expect(
      zoneMismatches(leg('2026-11-20T06:30', '2026-11-20T07:40'), { from: 'Sofia', to: 'Munich' }),
    ).toEqual([{ end: 'end', place: 'Munich', tz: 'Europe/Berlin', readIn: HEL, minutesOut: 60 }]);
    expect(
      zoneMismatches(leg('2026-11-20T09:00', '2026-11-20T12:05'), {
        from: 'Munich',
        to: 'Helsinki',
      }),
    ).toEqual([
      { end: 'start', place: 'Munich', tz: 'Europe/Berlin', readIn: HEL, minutesOut: 60 },
    ]);
  });

  it('leaves alone times that state a zone, and items without a route', () => {
    const pinned = {
      ...leg('2026-11-20T09:00', '2026-11-20T12:05'),
      startTzOverride: 'Europe/Berlin',
    };
    expect(
      zoneMismatches(
        { ...pinned, start: at('2026-11-20T09:00', 'Europe/Berlin') },
        { from: 'Munich', to: 'Helsinki' },
      ),
    ).toEqual([]);
    expect(zoneMismatches(leg('2026-11-20T09:00', '2026-11-20T12:05'), null)).toEqual([]);
  });

  it('ignores a date without a time', () => {
    const item = {
      start: { local: '2026-11-20', tz: HEL, precision: 'date' as const },
      end: null,
      startTzOverride: null,
      endTzOverride: null,
    };
    expect(zoneMismatches(item, { from: 'Munich' })).toEqual([]);
  });

  it('describes the mismatch in words', () => {
    const [m] = zoneMismatches(leg('2026-11-20T09:00', '2026-11-20T12:05'), {
      from: 'Munich',
      to: 'Helsinki',
    });
    expect(mismatchText(m)).toBe(
      'Departs Munich, but this time is read in Helsinki time. Munich is an hour behind.',
    );
    expect(mismatchText({ ...m, end: 'end', minutesOut: -120 })).toBe(
      'Arrives in Munich, but this time is read in Helsinki time. Munich is 2 hours ahead.',
    );
  });
});

describe('durationText', () => {
  it('reads hours and minutes', () => {
    expect(durationText(60)).toBe('1 hour');
    expect(durationText(-120)).toBe('2 hours');
    expect(durationText(30)).toBe('30 minutes');
    expect(durationText(90)).toBe('1 hour 30 minutes');
  });
});
