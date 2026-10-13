import {
  dayStops,
  daysForStop,
  defaultStopKey,
  resolveStopKey,
  stopDescription,
  stopKey,
  stopLabels,
  tripDates,
} from './dayRail';
import { buildTimeline, type TimelineItem } from './timeline';

/** Lapland: Fri 20 – Tue 24 November 2026. */
const trip = { startDate: '2026-11-20', endDate: '2026-11-24' };

const at = (local: string) =>
  ({ local, tz: 'Europe/Helsinki', precision: local.length > 10 ? 'time' : 'date' }) as const;

const item = (id: string, start: string, end: string | null = null): TimelineItem => ({
  id,
  kind: 'activity',
  status: 'confirmed',
  title: id,
  completedAt: null,
  start: at(start),
  end: end ? at(end) : null,
});

describe('tripDates', () => {
  it('lists every day, across a month end', () => {
    expect(tripDates(trip)).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
    ]);
    expect(tripDates({ startDate: '2026-10-30', endDate: '2026-11-02' })).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('counts the clock-change day once', () => {
    expect(tripDates({ startDate: '2026-10-24', endDate: '2026-10-26' })).toHaveLength(3);
  });
});

describe('dayStops', () => {
  it('offers every trip day, even with nothing planned, after All', () => {
    const keys = dayStops(trip, [], false).map(stopKey);
    expect(keys).toEqual(['all', ...tripDates(trip)]);
  });

  it('adds Before, After and No date only when there is something to show there', () => {
    const keys = dayStops(trip, ['2026-11-01', '2026-11-22', '2026-12-01'], true).map(stopKey);
    expect(keys).toEqual(['all', 'before', ...tripDates(trip), 'after', 'undated']);
  });

  it('numbers the days from the first', () => {
    const days = dayStops(trip, [], false).filter((stop) => stop.kind === 'day');
    expect(days.map((stop) => stop.kind === 'day' && stop.number)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('defaultStopKey', () => {
  it('opens on today during the trip, Day 1 before it and the last day after it', () => {
    expect(defaultStopKey(trip, '2026-11-22')).toBe('2026-11-22');
    expect(defaultStopKey(trip, '2026-10-13')).toBe('2026-11-20');
    expect(defaultStopKey(trip, '2026-12-01')).toBe('2026-11-24');
  });
});

describe('resolveStopKey', () => {
  const stops = dayStops(trip, ['2026-11-01'], false);

  it('keeps the reader where they chose while that stop exists', () => {
    expect(resolveStopKey(stops, '2026-11-23', '2026-11-20')).toBe('2026-11-23');
    expect(resolveStopKey(stops, 'before', '2026-11-20')).toBe('before');
  });

  it('falls back to the default when the chosen stop has gone, or none was chosen', () => {
    expect(resolveStopKey(stops, 'after', '2026-11-20')).toBe('2026-11-20');
    expect(resolveStopKey(stops, null, '2026-11-21')).toBe('2026-11-21');
  });
});

describe('daysForStop', () => {
  const days = buildTimeline([
    item('check-in online', '2026-11-18T09:00'),
    item('flight', '2026-11-20T06:00'),
    // An overnight train: departs on the 20th, arrives on the 21st.
    item('sleeper', '2026-11-20T19:29', '2026-11-21T07:20'),
    item('santa', '2026-11-22'),
    item('review', '2026-11-30'),
  ]);

  it('shows one day, an overnight arrival on the day it lands', () => {
    const [day21] = daysForStop({ kind: 'day', date: '2026-11-21', number: 2 }, days, trip);
    expect(day21.entries.map((entry) => entry.key)).toEqual(['sleeper:end']);
    const [day20] = daysForStop({ kind: 'day', date: '2026-11-20', number: 1 }, days, trip);
    expect(day20.entries.map((entry) => entry.key)).toEqual(['flight', 'sleeper']);
  });

  it('gives an empty day nothing, so the screen can say so', () => {
    expect(daysForStop({ kind: 'day', date: '2026-11-23', number: 4 }, days, trip)).toEqual([]);
  });

  it('keeps what is dated outside the trip reachable under Before and After', () => {
    expect(daysForStop({ kind: 'before' }, days, trip).map((day) => day.day)).toEqual([
      '2026-11-18',
    ]);
    expect(daysForStop({ kind: 'after' }, days, trip).map((day) => day.day)).toEqual([
      '2026-11-30',
    ]);
    expect(daysForStop({ kind: 'all' }, days, trip)).toHaveLength(days.length);
  });
});

describe('stop labels', () => {
  it('reads Day N over the weekday and date', () => {
    expect(stopLabels({ kind: 'day', date: '2026-11-20', number: 1 })).toEqual({
      label: 'Day 1',
      sublabel: 'Fri 20',
    });
    expect(stopLabels({ kind: 'before' }).label).toBe('Before');
  });

  it('says today in words, for a screen reader too', () => {
    const day = { kind: 'day' as const, date: '2026-11-22', number: 3 };
    expect(stopDescription(day, '2026-11-22')).toBe('Day 3, Sunday, 22 November, today');
    expect(stopDescription(day, '2026-10-13')).toBe('Day 3, Sunday, 22 November');
  });
});
