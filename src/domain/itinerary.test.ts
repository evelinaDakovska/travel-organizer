import {
  entryRoleLabel,
  openTasks,
  singleActiveTrip,
  undatedConfirmed,
  upNext,
} from './itinerary';
import type { LocalMoment } from './time';
import type { TimelineItem } from './timeline';
import type { Trip } from './trip';

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

/** 10:00 in Rome. */
const NOW = new Date('2026-09-19T08:00:00Z');

describe('upNext', () => {
  const day = [
    item({ id: 'breakfast', start: at('2026-09-19T09:00') }),
    item({ id: 'duomo', start: at('2026-09-19T10:30') }),
    item({ id: 'cafe', status: 'idea', start: at('2026-09-19T11:00') }),
    item({ id: 'pack', kind: 'task', start: at('2026-09-19T12:00') }),
    item({ id: 'tour', status: 'cancelled', start: at('2026-09-19T13:00') }),
    item({ id: 'museum', start: at('2026-09-19T15:00') }),
    item({ id: 'dinner', start: at('2026-09-19T20:00') }),
    item({ id: 'flight', kind: 'transport', start: at('2026-09-20T09:00') }),
  ];

  it('shows the next three confirmed things, in time order', () => {
    expect(upNext(day, NOW).map((e) => e.key)).toEqual(['duomo', 'museum', 'dinner']);
  });

  it('leaves out what has passed, ideas, tasks and cancellations', () => {
    const keys = upNext(day, NOW, 10).map((e) => e.key);
    expect(keys).toEqual(['duomo', 'museum', 'dinner', 'flight']);
  });

  it('surfaces a check-out, which is a real next thing to do', () => {
    const hotel = item({
      id: 'hotel',
      kind: 'stay',
      start: at('2026-09-18T15:00'),
      end: at('2026-09-22T11:00'),
    });
    expect(upNext([hotel], NOW).map((e) => e.key)).toEqual(['hotel:end']);
  });

  it('is empty when nothing confirmed is still ahead', () => {
    expect(upNext([item({ id: 'past', start: at('2026-09-18T20:00') })], NOW)).toEqual([]);
  });
});

describe('openTasks', () => {
  const tasks = [
    item({ id: 't1', kind: 'task', title: 'Buy tickets', start: at('2026-09-20T09:00') }),
    item({ id: 't2', kind: 'task', title: 'Online check-in', start: at('2026-09-19T18:00') }),
    item({ id: 't3', kind: 'task', title: 'Adapter' }),
    item({ id: 't6', kind: 'task', title: 'Passport copies' }),
    item({ id: 't4', kind: 'task', title: 'Done already', completedAt: '2026-09-18T10:00:00.000Z' }),
    item({ id: 't5', kind: 'task', title: 'Called off', status: 'cancelled' }),
    item({ id: 'a1', kind: 'activity', title: 'Not a task' }),
  ];

  it('lists dated tasks by time, then undated ones by title', () => {
    expect(openTasks(tasks).map((t) => t.id)).toEqual(['t2', 't1', 't3', 't6']);
  });

  it('leaves out done and cancelled tasks, and anything that is not a task', () => {
    const ids = openTasks(tasks).map((t) => t.id);
    expect(ids).not.toContain('t4');
    expect(ids).not.toContain('t5');
    expect(ids).not.toContain('a1');
  });
});

describe('undatedConfirmed', () => {
  it('keeps confirmed items without a date, by title, so the Timeline can still show them', () => {
    const items = [
      item({ id: 'b', title: 'Rental car' }),
      item({ id: 'a', title: 'Airport transfer' }),
      item({ id: 'dated', start: at('2026-09-19') }),
      item({ id: 'idea', status: 'idea' }),
      item({ id: 'cancelled', status: 'cancelled' }),
    ];
    expect(undatedConfirmed(items).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('entryRoleLabel', () => {
  it('names the two ends of a stay and of a journey', () => {
    expect(entryRoleLabel({ role: 'start', item: { kind: 'stay' } })).toBe('Check in');
    expect(entryRoleLabel({ role: 'end', item: { kind: 'stay' } })).toBe('Check out');
    expect(entryRoleLabel({ role: 'start', item: { kind: 'transport' } })).toBe('Departs');
    expect(entryRoleLabel({ role: 'end', item: { kind: 'transport' } })).toBe('Arrives');
  });

  it('falls back to starts and ends for anything else that spans days', () => {
    expect(entryRoleLabel({ role: 'start', item: { kind: 'activity' } })).toBe('Starts');
    expect(entryRoleLabel({ role: 'end', item: { kind: 'activity' } })).toBe('Ends');
  });

  it('adds nothing to a single-day entry', () => {
    expect(entryRoleLabel({ role: 'full', item: { kind: 'stay' } })).toBeNull();
  });
});

describe('singleActiveTrip', () => {
  const trip = (id: string, startDate: string, endDate: string) =>
    ({ id, name: id, startDate, endDate }) as unknown as Trip;
  const midTrip = new Date(2026, 8, 20, 12);

  it('picks the one trip in progress', () => {
    const trips = [trip('milan', '2026-09-19', '2026-09-22'), trip('lapland', '2026-11-20', '2026-11-24')];
    expect(singleActiveTrip(trips, midTrip)?.id).toBe('milan');
  });

  it('refuses to guess when two overlap, and returns nothing when none is on', () => {
    const overlapping = [trip('a', '2026-09-19', '2026-09-22'), trip('b', '2026-09-20', '2026-09-21')];
    expect(singleActiveTrip(overlapping, midTrip)).toBeNull();
    expect(singleActiveTrip([trip('later', '2026-11-20', '2026-11-24')], midTrip)).toBeNull();
  });
});
