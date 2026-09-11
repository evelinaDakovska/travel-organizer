import {
  buildTimeline,
  entriesOnDay,
  minutesUntilEntry,
  nextEntries,
  timelineEntries,
  type TimelineItem,
} from './timeline';
import type { LocalMoment } from './time';

const at = (local: string, tz = 'Europe/Rome'): LocalMoment => ({
  local,
  tz,
  precision: local.includes('T') ? 'time' : 'date',
});

function item(overrides: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    kind: 'activity',
    status: 'confirmed',
    title: overrides.id,
    start: null,
    end: null,
    completedAt: null,
    ...overrides,
  };
}

const days = (items: TimelineItem[]) => buildTimeline(items).map((d) => d.day);
const keys = (items: TimelineItem[]) => timelineEntries(items).map((e) => e.key);

describe('grouping by local day', () => {
  it('keeps a 23:30 event on its own local day even when the instant is the next UTC day', () => {
    const late = item({ id: 'late', start: at('2026-09-19T23:30', 'America/New_York') });

    expect(timelineEntries([late])[0].instant).toBe('2026-09-20T03:30:00.000Z');
    expect(days([late])).toEqual(['2026-09-19']);
  });

  it('keeps a morning event on its own local day when the instant is the previous UTC day', () => {
    const early = item({ id: 'early', start: at('2026-09-19T09:00', 'Pacific/Auckland') });

    expect(timelineEntries([early])[0].instant).toBe('2026-09-18T21:00:00.000Z');
    expect(days([early])).toEqual(['2026-09-19']);
  });

  it('orders days chronologically regardless of input order', () => {
    const items = [
      item({ id: 'c', start: at('2026-09-21T09:00') }),
      item({ id: 'a', start: at('2026-09-19T09:00') }),
      item({ id: 'b', start: at('2026-09-20T09:00') }),
    ];

    expect(days(items)).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
  });

  it('orders within a day by instant, so zones stay in true chronological order', () => {
    // 09:00 in Tokyo happens long before 09:00 in Rome on the same date.
    const rome = item({ id: 'rome', start: at('2026-09-19T09:00', 'Europe/Rome') });
    const tokyo = item({ id: 'tokyo', start: at('2026-09-19T09:00', 'Asia/Tokyo') });

    expect(keys([rome, tokyo])).toEqual(['tokyo', 'rome']);
  });
});

describe('date-only items', () => {
  it('sorts a date-only item to the top of its day', () => {
    const flight = item({ id: 'flight', start: at('2026-09-19T06:10') });
    const someday = item({ id: 'someday', start: at('2026-09-19') });

    expect(keys([flight, someday])).toEqual(['someday', 'flight']);
  });

  it('sorts a date-only item above a real 00:00, which shares its instant', () => {
    const midnight = item({ id: 'midnight', start: at('2026-09-19T00:00') });
    const dateOnly = item({ id: 'dateOnly', start: at('2026-09-19') });

    const entries = timelineEntries([midnight, dateOnly]);
    expect(entries[0].instant).toBe(entries[1].instant);
    expect(entries.map((e) => e.key)).toEqual(['dateOnly', 'midnight']);
    expect(entries[0].time).toBeNull();
    expect(entries[1].time).toBe('00:00');
  });
});

describe('multi-day items', () => {
  const hotel = item({
    id: 'hotel',
    kind: 'stay',
    start: at('2026-09-19T15:00'),
    end: at('2026-09-22T11:00'),
  });

  it('derives two entries, one on the day it starts and one on the day it ends', () => {
    const entries = timelineEntries([hotel]);

    expect(entries.map((e) => [e.key, e.role, e.time])).toEqual([
      ['hotel', 'start', '15:00'],
      ['hotel:end', 'end', '11:00'],
    ]);
    expect(days([hotel])).toEqual(['2026-09-19', '2026-09-22']);
  });

  it('leaves the days in between empty rather than repeating the stay', () => {
    expect(days([hotel])).not.toContain('2026-09-20');
  });

  it('places the check-out in time order among the other items, not at the top', () => {
    const breakfast = item({ id: 'breakfast', kind: 'food', start: at('2026-09-22T08:00') });
    const train = item({ id: 'train', kind: 'transport', start: at('2026-09-22T14:00') });

    expect(keys([hotel, train, breakfast])).toEqual([
      'hotel',
      'breakfast',
      'hotel:end',
      'train',
    ]);
  });

  it('keeps a single entry when the item ends on the day it starts', () => {
    const lunch = item({
      id: 'lunch',
      kind: 'food',
      start: at('2026-09-19T12:00'),
      end: at('2026-09-19T13:30'),
    });

    expect(timelineEntries([lunch]).map((e) => e.role)).toEqual(['full']);
  });

  it('splits an overnight journey so the arrival lands on the day it arrives', () => {
    const sleeper = item({
      id: 'sleeper',
      kind: 'transport',
      start: at('2026-09-19T22:40'),
      end: at('2026-09-20T07:15'),
    });

    expect(days([sleeper])).toEqual(['2026-09-19', '2026-09-20']);
  });
});

describe('what the timeline leaves out', () => {
  it('excludes cancelled items, which still exist to hold their cancellation document', () => {
    const cancelled = item({ id: 'x', status: 'cancelled', start: at('2026-09-19T09:00') });

    expect(timelineEntries([cancelled])).toEqual([]);
  });

  it('excludes undated items, which live in Places until a date is assigned', () => {
    expect(timelineEntries([item({ id: 'idea', status: 'idea' })])).toEqual([]);
  });

  it('keeps a dated idea, because a plan that is not booked is still on the day', () => {
    const idea = item({ id: 'idea', status: 'idea', start: at('2026-09-19T10:00') });

    expect(keys([idea])).toEqual(['idea']);
  });

  it('keeps a completed task, which happened and should stay visible', () => {
    const task = item({
      id: 'task',
      kind: 'task',
      start: at('2026-09-18T12:00'),
      completedAt: '2026-09-18T11:02:00.000Z',
    });

    expect(keys([task])).toEqual(['task']);
  });
});

describe('nextEntries', () => {
  const now = new Date('2026-09-19T10:00:00.000Z');

  it('returns the next two, which is what the Now card shows', () => {
    const items = [
      item({ id: 'duomo', start: at('2026-09-19T14:00') }),
      item({ id: 'dinner', kind: 'food', start: at('2026-09-19T19:30') }),
      item({ id: 'late', start: at('2026-09-19T22:00') }),
    ];

    expect(nextEntries(items, now).map((e) => e.key)).toEqual(['duomo', 'dinner']);
  });

  it('ignores what has already happened', () => {
    const items = [
      item({ id: 'flight', kind: 'transport', start: at('2026-09-19T06:10') }),
      item({ id: 'duomo', start: at('2026-09-19T14:00') }),
    ];

    expect(nextEntries(items, now).map((e) => e.key)).toEqual(['duomo']);
  });

  it('includes an item dated before the trip, such as a flight check-in', () => {
    const checkIn = item({
      id: 'checkin',
      kind: 'task',
      title: 'Online check-in',
      start: at('2026-09-19T12:00'),
    });
    const duomo = item({ id: 'duomo', start: at('2026-09-20T14:00') });

    expect(nextEntries([duomo, checkIn], now).map((e) => e.key)).toEqual(['checkin', 'duomo']);
  });

  it('excludes cancelled items', () => {
    const items = [
      item({ id: 'cancelled', status: 'cancelled', start: at('2026-09-19T14:00') }),
      item({ id: 'duomo', start: at('2026-09-19T16:00') }),
    ];

    expect(nextEntries(items, now).map((e) => e.key)).toEqual(['duomo']);
  });

  it('excludes a completed task but keeps an outstanding one', () => {
    const done = item({
      id: 'done',
      kind: 'task',
      start: at('2026-09-19T14:00'),
      completedAt: '2026-09-19T09:00:00.000Z',
    });
    const todo = item({ id: 'todo', kind: 'task', start: at('2026-09-19T16:00') });

    expect(nextEntries([done, todo], now).map((e) => e.key)).toEqual(['todo']);
  });

  it('surfaces a check-out, which is a real next thing to do', () => {
    const hotel = item({
      id: 'hotel',
      kind: 'stay',
      start: at('2026-09-17T15:00'),
      end: at('2026-09-19T11:00'),
    });

    // 08:00 in Rome, with check-out at 11:00 still ahead.
    const morning = new Date('2026-09-19T06:00:00.000Z');
    expect(nextEntries([hotel], morning).map((e) => e.key)).toEqual(['hotel:end']);
  });

  it('returns nothing when the trip is over, so there is no Now card', () => {
    const past = item({ id: 'past', start: at('2026-09-18T09:00') });

    expect(nextEntries([past], now)).toEqual([]);
  });

  it('returns nothing when every item is undated', () => {
    expect(nextEntries([item({ id: 'idea', status: 'idea' })], now)).toEqual([]);
  });

  it('honours an explicit limit', () => {
    const items = [
      item({ id: 'a', start: at('2026-09-19T14:00') }),
      item({ id: 'b', start: at('2026-09-19T15:00') }),
    ];

    expect(nextEntries(items, now, 1).map((e) => e.key)).toEqual(['a']);
  });
});

describe('helpers', () => {
  it('counts whole minutes to an entry and goes negative once it has passed', () => {
    const now = new Date('2026-09-19T10:28:00.000Z');
    const duomo = item({ id: 'duomo', start: at('2026-09-19T14:00') });
    const [entry] = timelineEntries([duomo]);

    // 14:00 Rome is 12:00Z, so 1h 32m away.
    expect(minutesUntilEntry(entry, now)).toBe(92);
    expect(minutesUntilEntry(entry, new Date('2026-09-19T13:00:00.000Z'))).toBe(-60);
  });

  it('returns one day of entries, and nothing for a day with none', () => {
    const timeline = buildTimeline([
      item({ id: 'a', start: at('2026-09-19T09:00') }),
      item({ id: 'b', start: at('2026-09-21T09:00') }),
    ]);

    expect(entriesOnDay(timeline, '2026-09-19').map((e) => e.key)).toEqual(['a']);
    expect(entriesOnDay(timeline, '2026-09-20')).toEqual([]);
  });
});
