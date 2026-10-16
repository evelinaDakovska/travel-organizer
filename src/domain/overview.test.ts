import {
  baseTonight,
  leadNote,
  overviewPlan,
  pastTripSummary,
  resolveStayForOverview,
  staysAndRentals,
} from './overview';
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

describe('ongoing trip prioritization & date-only plans', () => {
  it('does not let a multi-day hotel stay obscure the next flight, activity, or transfer', () => {
    const hotel = item('hotel', {
      kind: 'stay',
      start: at('2026-11-20T14:00'),
      end: at('2026-11-25T11:00'),
    });
    const flight = item('flight', {
      kind: 'transport',
      start: at('2026-11-20T16:00'),
      end: at('2026-11-20T18:00'),
    });
    const safari = item('safari', {
      kind: 'activity',
      start: at('2026-11-21T10:00'),
      end: at('2026-11-21T13:00'),
    });

    // On ongoing trip before flight: flight is the lead, NOT hotel
    const plan = overviewPlan([hotel, flight, safari], trip, helsinki('2026-11-20T12:00'));
    expect(plan.lead?.entry.key).toBe('flight');
    expect(plan.lead?.reason).toBe('next');

    // Neither hotel check-in nor check-out is in plan.next
    expect(plan.next.map((e) => e.item.kind)).not.toContain('stay');
  });

  it('handles an ongoing trip with only date-only plans cleanly', () => {
    const dateOnlyActivity = item('walk', {
      kind: 'activity',
      start: at('2026-11-20'),
      end: at('2026-11-20'),
    });

    const plan = overviewPlan([dateOnlyActivity], trip, helsinki('2026-11-20T10:00'));
    expect(plan.lead).toBeNull();
    expect(plan.today).toHaveLength(1);
    expect(plan.today[0].item.id).toBe('walk');
  });

  it('handles an ongoing trip with empty itinerary without crashing', () => {
    const plan = overviewPlan([], trip, helsinki('2026-11-20T10:00'));
    expect(plan.lead).toBeNull();
    expect(plan.next).toEqual([]);
    expect(plan.today).toEqual([]);
  });
});

describe('resolveStayForOverview', () => {
  it('distinguishes check-in today (future time) from checked-in (past time)', () => {
    const stay = item('hotel', {
      kind: 'stay',
      start: at('2026-11-20T15:00'),
      end: at('2026-11-24T11:00'),
    });

    // At 10:00 AM on check-in day: not checked in yet!
    const beforeCheckin = resolveStayForOverview([stay], '2026-11-20', helsinki('2026-11-20T10:00'));
    expect(beforeCheckin).toMatchObject({
      type: 'current',
      status: 'checkin_today',
      checkinTime: '15:00',
    });

    // At 16:00 on check-in day: checked in!
    const afterCheckin = resolveStayForOverview([stay], '2026-11-20', helsinki('2026-11-20T16:00'));
    expect(afterCheckin).toMatchObject({
      type: 'current',
      status: 'checked_in',
    });
  });

  it('marks middle of stay as checked_in', () => {
    const stay = item('hotel', {
      kind: 'stay',
      start: at('2026-11-20T15:00'),
      end: at('2026-11-24T11:00'),
    });

    const day2 = resolveStayForOverview([stay], '2026-11-21', helsinki('2026-11-21T12:00'));
    expect(day2).toMatchObject({
      type: 'current',
      status: 'checked_in',
    });
  });

  it('detects upcoming stay when there is a gap between stays', () => {
    const upcomingHotel = item('cabin', {
      kind: 'stay',
      start: at('2026-11-22T14:00'),
      end: at('2026-11-24T10:00'),
    });

    const gapDay = resolveStayForOverview([upcomingHotel], '2026-11-21', helsinki('2026-11-21T12:00'));
    expect(gapDay).toMatchObject({
      type: 'upcoming',
      status: 'next_stay',
      checkinDay: '2026-11-22',
      checkinTime: '14:00',
    });
  });

  it('detects overnight transport covering tonight', () => {
    const overnightTrain = item('sleeper', {
      kind: 'transport',
      start: at('2026-11-20T20:00'),
      end: at('2026-11-21T07:00'),
    });

    const res = resolveStayForOverview([overnightTrain], '2026-11-20', helsinki('2026-11-20T21:00'));
    expect(res).toMatchObject({
      type: 'overnight_transport',
      transport: { id: 'sleeper' },
    });
  });

  it('returns type: none when no stays or overnight transport exist', () => {
    const res = resolveStayForOverview([], '2026-11-20', helsinki('2026-11-20T12:00'));
    expect(res).toEqual({ type: 'none' });
  });
});

describe('pastTripSummary', () => {
  it('computes places count and spending totals by currency', () => {
    const items = [
      item('hotel', { kind: 'stay', status: 'confirmed' }),
      item('museum', { kind: 'activity', status: 'confirmed' }),
      item('task', { kind: 'task', status: 'confirmed' }),
      item('cancelled', { kind: 'activity', status: 'cancelled' }),
    ];
    const expenses = [
      { amount: 1500, currency: 'EUR' },
      { amount: 2500, currency: 'EUR' },
      { amount: 5000, currency: 'SEK' },
    ];

    const summary = pastTripSummary(items, expenses);
    expect(summary.placesCount).toBe(2);
    expect(summary.totalSpentByCurrency).toEqual({ EUR: 4000, SEK: 5000 });
  });
});
