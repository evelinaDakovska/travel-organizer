import { baseTonight, leadNote, overviewPlan, staysAndRentals } from './overview';
import type { LocalMoment } from './time';
import type { TimelineItem } from './timeline';

const at = (local: string): LocalMoment => ({
  local,
  tz: 'Europe/Helsinki',
  precision: local.includes('T') ? 'time' : 'date',
});

type Item = TimelineItem & { subkind?: string | null };

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  kind: 'activity',
  status: 'confirmed',
  title: id,
  start: null,
  end: null,
  completedAt: null,
  ...over,
});

const trip = { startDate: '2026-11-20' };
const helsinki = (local: string) => new Date(`${local}:00+02:00`);

describe('overviewPlan', () => {
  const items = [
    item('museum', { start: at('2026-11-19T18:00') }),
    item('flight', { kind: 'transport', start: at('2026-11-20T06:00'), end: at('2026-11-20T07:05') }),
    item('train', { kind: 'transport', start: at('2026-11-20T19:29'), end: at('2026-11-21T07:20') }),
    item('pack', { kind: 'task', start: at('2026-11-19T20:00') }),
    item('husky', { start: at('2026-11-22T09:00'), end: at('2026-11-22T11:15') }),
  ];

  it('leads with the first departure before the trip, even with something booked earlier', () => {
    const plan = overviewPlan(items, trip, helsinki('2026-10-13T12:00'));
    expect(plan.lead).toMatchObject({ reason: 'firstDeparture', entry: { key: 'flight' } });
    expect(plan.next.map((entry) => entry.key)).toEqual(['museum', 'train', 'train:end', 'husky']);
  });

  it('leads with what is happening during the trip', () => {
    const plan = overviewPlan(items, trip, helsinki('2026-11-22T10:00'));
    expect(plan.lead).toMatchObject({ reason: 'happening', entry: { key: 'husky' } });
    expect(plan.alsoHappening).toEqual([]);
    expect(plan.next).toEqual([]);
  });

  it('keeps other things on now apart from what is next', () => {
    const tour = item('tour', { start: at('2026-11-22T09:30'), end: at('2026-11-22T10:30') });
    const plan = overviewPlan([...items, tour], trip, helsinki('2026-11-22T10:00'));
    expect(plan.lead?.entry.key).toBe('husky');
    expect(plan.alsoHappening.map((entry) => entry.key)).toEqual(['tour']);
  });

  it('leads with what is next when nothing is on, and never repeats the lead', () => {
    const plan = overviewPlan(items, trip, helsinki('2026-11-20T12:00'));
    expect(plan.lead).toMatchObject({ reason: 'next', entry: { key: 'train' } });
    expect(plan.next.map((entry) => entry.key)).toEqual(['train:end', 'husky']);
  });

  it('has no lead when nothing is left', () => {
    expect(overviewPlan(items, trip, helsinki('2026-12-01T12:00')).lead).toBeNull();
  });

  it('caps the rows after the lead', () => {
    expect(overviewPlan(items, trip, helsinki('2026-10-13T12:00'), 2).next).toHaveLength(2);
  });
});

describe('baseTonight', () => {
  const cabin = item('cabin', { kind: 'stay', start: at('2026-11-21T15:00'), end: at('2026-11-24T11:00') });

  it('is the stay checked into and not yet checked out of', () => {
    expect(baseTonight([cabin], '2026-11-21')?.id).toBe('cabin');
    expect(baseTonight([cabin], '2026-11-23')?.id).toBe('cabin');
  });

  it('is nothing on check-out day, or before check-in', () => {
    expect(baseTonight([cabin], '2026-11-24')).toBeNull();
    expect(baseTonight([cabin], '2026-11-20')).toBeNull();
  });

  it('takes the one begun last when two overlap', () => {
    const hotel = item('hotel', { kind: 'stay', start: at('2026-11-20'), end: at('2026-11-22') });
    expect(baseTonight([hotel, cabin], '2026-11-21')?.id).toBe('cabin');
  });

  it('takes the latest started hotel on the same date regardless of alphabetical title (C2)', () => {
    const hotelA = {
      ...item('a-hotel', { kind: 'stay', start: at('2026-11-21T10:00'), end: at('2026-11-24T11:00') }),
      title: 'A Hotel',
    };
    const hotelZ = {
      ...item('z-hotel', { kind: 'stay', start: at('2026-11-21T16:00'), end: at('2026-11-24T11:00') }),
      title: 'Z Hotel',
    };
    expect(baseTonight([hotelA, hotelZ], '2026-11-21')?.id).toBe('z-hotel');
  });

  it('breaks ties on identical start dates with end instant then title', () => {
    const stayShort = {
      ...item('stay-short', { kind: 'stay', start: at('2026-11-21'), end: at('2026-11-22') }),
      title: 'Short Stay',
    };
    const stayLong = {
      ...item('stay-long', { kind: 'stay', start: at('2026-11-21'), end: at('2026-11-24') }),
      title: 'Long Stay',
    };
    expect(baseTonight([stayShort, stayLong], '2026-11-21')?.id).toBe('stay-long');
  });

  it('covers one night for a stay with no end, and none for an undated, idea or cancelled one', () => {
    const night = item('night', { kind: 'stay', start: at('2026-11-20') });
    expect(baseTonight([night], '2026-11-20')?.id).toBe('night');
    expect(baseTonight([night], '2026-11-21')).toBeNull();
    expect(baseTonight([item('undated', { kind: 'stay' })], '2026-11-21')).toBeNull();
    expect(baseTonight([{ ...cabin, status: 'idea' }], '2026-11-22')).toBeNull();
    expect(baseTonight([{ ...cabin, status: 'cancelled' }], '2026-11-22')).toBeNull();
  });
});

describe('staysAndRentals', () => {
  it('lists stays and car rentals not yet over, in order, and nothing else', () => {
    const items = [
      item('cabin', { kind: 'stay', start: at('2026-11-21T15:00'), end: at('2026-11-24T11:00') }),
      item('car', { kind: 'transport', subkind: 'car', start: at('2026-11-21T08:00'), end: at('2026-11-24T11:00') }),
      item('flight', { kind: 'transport', subkind: 'flight', start: at('2026-11-20T06:00') }),
      item('old', { kind: 'stay', start: at('2026-09-19'), end: at('2026-09-22') }),
      item('maybe', { kind: 'stay', status: 'idea', start: at('2026-11-22') }),
    ];
    const ids = staysAndRentals(items, helsinki('2026-10-13T12:00')).map((found) => found.id);
    expect(ids).toEqual(['car', 'cabin']);
  });
});

describe('leadNote', () => {
  const lead = (
    over: Partial<Item> & { details?: Record<string, unknown> },
    role: 'full' | 'start' | 'end' = 'full',
  ) => {
    const found = {
      ...item('lead', over),
      subkind: null,
      details: over.details ?? null,
      endTzOverride: null,
    };
    return { key: found.id, item: found, role, moment: found.start!, instant: '', time: null };
  };

  it('names a journey’s arrival and its clock, not “until”', () => {
    const flight = lead({
      kind: 'transport',
      start: at('2026-11-20T09:20'),
      end: at('2026-11-20T12:15'),
      details: { from: 'Sofia', to: 'Helsinki' },
    });
    expect(leadNote(flight, 'firstDeparture')).toBe('Arrives 12:15 · Helsinki time');
  });

  it('dates an overnight arrival', () => {
    const sleeper = lead(
      {
        kind: 'transport',
        start: at('2026-11-20T19:27'),
        end: at('2026-11-21T07:40'),
        details: { from: 'Helsinki', to: 'Rovaniemi' },
      },
      'start',
    );
    expect(leadNote(sleeper, 'next')).toBe('Arrives Sat 21 Nov · 07:40 · Rovaniemi time');
  });

  it('says until for anything else, and nothing without an end or for an end', () => {
    const tour = { start: at('2026-11-22T09:00'), end: at('2026-11-22T11:15') };
    expect(leadNote(lead(tour), 'next')).toBe('Until 11:15');
    expect(leadNote(lead({ start: at('2026-11-22T09:00') }), 'next')).toBeNull();
    expect(leadNote(lead(tour, 'end'), 'next')).toBeNull();
  });
});
