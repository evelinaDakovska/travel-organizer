import {
  defaultItemDate,
  groupTrips,
  isTripActive,
  parseTripRow,
  tripDurationDays,
  tripInputSchema,
  tripPhase,
  tripPhaseLabel,
  type TripRow,
} from './trip';

const row: TripRow = {
  id: 't1',
  name: 'Milan',
  destination: 'Italy',
  start_date: '2026-09-19',
  end_date: '2026-09-22',
  default_tz: 'Europe/Rome',
  cover_path: null,
  notes: null,
  traveller_count: 3,
  travellers: '["Evelina","Sam"]',
  created_at: '2026-09-11T00:00:00.000Z',
  updated_at: '2026-09-11T00:00:00.000Z',
};

describe('parseTripRow', () => {
  it('maps snake_case columns to the domain shape', () => {
    const trip = parseTripRow(row);
    expect(trip.startDate).toBe('2026-09-19');
    expect(trip.defaultTz).toBe('Europe/Rome');
    expect(trip.travellers).toEqual(['Evelina', 'Sam']);
  });

  it('survives malformed or absent traveller JSON', () => {
    expect(parseTripRow({ ...row, travellers: 'not json' }).travellers).toEqual([]);
    expect(parseTripRow({ ...row, travellers: null }).travellers).toEqual([]);
    expect(parseTripRow({ ...row, travellers: '[1,"ok",null]' }).travellers).toEqual(['ok']);
  });
});

describe('tripDurationDays', () => {
  it('counts inclusively', () => {
    expect(tripDurationDays({ startDate: '2026-09-19', endDate: '2026-09-22' })).toBe(4);
    expect(tripDurationDays({ startDate: '2026-09-19', endDate: '2026-09-19' })).toBe(1);
  });

  it('is not thrown off by a DST change inside the trip', () => {
    expect(tripDurationDays({ startDate: '2026-10-24', endDate: '2026-10-26' })).toBe(3);
  });
});

describe('tripInputSchema', () => {
  const valid = {
    name: 'Milan',
    startDate: '2026-09-19',
    endDate: '2026-09-22',
    defaultTz: 'Europe/Rome',
  };

  it('accepts a minimal valid trip', () => {
    expect(tripInputSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a name', () => {
    expect(tripInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('rejects an end date before the start date, on the endDate field', () => {
    const result = tripInputSchema.safeParse({ ...valid, endDate: '2026-09-18' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['endDate']);
    }
  });

  it('accepts a single-day trip', () => {
    expect(tripInputSchema.safeParse({ ...valid, endDate: valid.startDate }).success).toBe(true);
  });

  it('rejects an unknown timezone', () => {
    expect(tripInputSchema.safeParse({ ...valid, defaultTz: 'Mars/Olympus' }).success).toBe(false);
  });

  it('rejects an impossible date', () => {
    expect(tripInputSchema.safeParse({ ...valid, startDate: '2026-02-30' }).success).toBe(false);
  });
});

describe('groupTrips', () => {
  const make = (id: string, startDate: string, endDate: string) =>
    parseTripRow({ ...row, id, start_date: startDate, end_date: endDate });

  const trips = [
    make('past', '2026-05-01', '2026-05-08'),
    make('current', '2026-09-08', '2026-09-14'),
    make('soon', '2026-09-19', '2026-09-22'),
    make('later', '2026-11-20', '2026-11-24'),
    make('older', '2026-01-02', '2026-01-09'),
  ];
  const now = new Date(2026, 8, 11);

  it('keeps a trip in progress under upcoming, not past', () => {
    const { upcoming } = groupTrips(trips, now);
    expect(upcoming.map((t) => t.id)).toEqual(['current', 'soon', 'later']);
  });

  it('orders past trips most recent first', () => {
    expect(groupTrips(trips, now).past.map((t) => t.id)).toEqual(['past', 'older']);
  });

  it('moves a trip to past only after its end date', () => {
    const trip = make('edge', '2026-09-19', '2026-09-22');
    expect(groupTrips([trip], new Date(2026, 8, 22, 23, 30)).upcoming).toHaveLength(1);
    expect(groupTrips([trip], new Date(2026, 8, 23, 0, 30)).past).toHaveLength(1);
  });
});

describe('isTripActive', () => {
  const trip = parseTripRow({ ...row, start_date: '2026-09-19', end_date: '2026-09-22' });

  it('is true on the first and last day', () => {
    expect(isTripActive(trip, new Date(2026, 8, 19, 6, 0))).toBe(true);
    expect(isTripActive(trip, new Date(2026, 8, 22, 23, 0))).toBe(true);
  });

  it('is false either side', () => {
    expect(isTripActive(trip, new Date(2026, 8, 18, 23, 0))).toBe(false);
    expect(isTripActive(trip, new Date(2026, 8, 23, 1, 0))).toBe(false);
  });
});

describe('defaultItemDate', () => {
  const trip = { startDate: '2026-10-19', endDate: '2026-10-23' };

  it('opens on the first day of a trip that has not started', () => {
    expect(defaultItemDate(trip, new Date(2026, 9, 10, 12))).toBe('2026-10-19');
  });

  it('opens on today while the trip is under way', () => {
    expect(defaultItemDate(trip, new Date(2026, 9, 21, 12))).toBe('2026-10-21');
  });

  it('opens on the first day of a trip that is over', () => {
    expect(defaultItemDate(trip, new Date(2026, 10, 2, 12))).toBe('2026-10-19');
  });
});

describe('tripPhase', () => {
  const trip = { startDate: '2026-11-20', endDate: '2026-11-24' };
  const on = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0);
  const label = (now: Date) => tripPhaseLabel(tripPhase(trip, now));

  it('counts down before the trip, with tomorrow by name', () => {
    expect(tripPhase(trip, new Date(2026, 9, 12, 9, 0))).toEqual({ phase: 'before', daysToGo: 39 });
    expect(label(on(18))).toBe('In 2 days');
    expect(label(on(19, 23))).toBe('Tomorrow');
  });

  it('counts the days during the trip, first and last included', () => {
    expect(label(on(20, 0))).toBe('Day 1 of 5');
    expect(label(on(22))).toBe('Day 3 of 5');
    expect(label(on(24, 23))).toBe('Day 5 of 5');
  });

  it('has ended from the day after', () => {
    expect(label(on(25, 0))).toBe('Ended');
  });

  it('crosses a month end without miscounting', () => {
    expect(tripPhase({ startDate: '2026-10-30', endDate: '2026-11-02' }, new Date(2026, 10, 1, 8))).toEqual(
      { phase: 'during', day: 3, of: 4 },
    );
  });
});
