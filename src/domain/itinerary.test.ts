import {
  doneTasks,
  ENDED_GRACE_MINUTES,
  entryRoleLabel,
  happeningNote,
  nowSections,
  todayNote,
  entryZoneLabel,
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

describe('entryZoneLabel', () => {
  const flight = { startTzOverride: 'Europe/Sofia', endTzOverride: null };

  it('names the zone an end states for itself', () => {
    expect(entryZoneLabel({ role: 'start', item: flight })).toBe('Sofia');
    expect(entryZoneLabel({ role: 'full', item: flight })).toBe('Sofia');
  });

  it('says nothing for an end that follows the trip', () => {
    expect(entryZoneLabel({ role: 'end', item: flight })).toBeNull();
    expect(entryZoneLabel({ role: 'full', item: { startTzOverride: null, endTzOverride: null } })).toBeNull();
  });
});

describe('entryRoleLabel', () => {
  it('names the two ends of a stay and of a journey', () => {
    expect(entryRoleLabel({ role: 'start', item: { kind: 'stay' } })).toBe('Check in');
    expect(entryRoleLabel({ role: 'end', item: { kind: 'stay' } })).toBe('Check out');
    expect(entryRoleLabel({ role: 'start', item: { kind: 'transport' } })).toBe('Departs');
    expect(entryRoleLabel({ role: 'end', item: { kind: 'transport' } })).toBe('Arrives');
    expect(entryRoleLabel({ role: 'start', item: { kind: 'transport', subkind: 'car' } })).toBe('Pick up');
    expect(entryRoleLabel({ role: 'end', item: { kind: 'transport', subkind: 'car' } })).toBe('Drop off');
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

describe('nowSections', () => {
  const keys = (entries: { key: string }[]) => entries.map((entry) => entry.key);
  /** The review's case: 09:00–11:15 in Helsinki on 22 November. */
  const husky = item({
    id: 'husky',
    start: at('2026-11-22T09:00', 'Europe/Helsinki'),
    end: at('2026-11-22T11:15', 'Europe/Helsinki'),
  });
  const helsinki = (time: string) => new Date(`2026-11-22T${time}:00+02:00`);

  describe('happening now', () => {
    it('is not happening before the start, and is still up next', () => {
      const sections = nowSections([husky], helsinki('08:59'));
      expect(sections.happening).toEqual([]);
      expect(keys(sections.upNext)).toEqual(['husky']);
    });

    it('is happening exactly at the start, and not repeated in up next', () => {
      const sections = nowSections([husky], helsinki('09:00'));
      expect(keys(sections.happening)).toEqual(['husky']);
      expect(sections.upNext).toEqual([]);
    });

    it('is happening during the event', () => {
      expect(keys(nowSections([husky], helsinki('09:05')).happening)).toEqual(['husky']);
    });

    it('stays for the grace minutes after the end, then goes', () => {
      expect(ENDED_GRACE_MINUTES).toBe(15);
      expect(keys(nowSections([husky], helsinki('11:15')).happening)).toEqual(['husky']);
      expect(keys(nowSections([husky], helsinki('11:29')).happening)).toEqual(['husky']);
      expect(nowSections([husky], helsinki('11:30')).happening).toEqual([]);
    });

    it('keeps an event with no end for 60 minutes after its start, with no grace on top', () => {
      const open = item({ id: 'open', start: at('2026-11-22T09:00', 'Europe/Helsinki') });
      expect(keys(nowSections([open], helsinki('09:59')).happening)).toEqual(['open']);
      expect(nowSections([open], helsinki('10:00')).happening).toEqual([]);
    });

    it('never shows a cancelled event, an idea or a task', () => {
      const others = [
        { ...husky, id: 'cancelled', status: 'cancelled' as const },
        { ...husky, id: 'idea', status: 'idea' as const },
        { ...husky, id: 'task', kind: 'task' as const },
      ];
      const sections = nowSections(others, helsinki('09:30'));
      expect(sections.happening).toEqual([]);
      expect(sections.upNext).toEqual([]);
    });

    it('shows an overnight journey between departure and arrival, without repeating Arrives', () => {
      const train = item({
        id: 'train',
        kind: 'transport',
        start: at('2026-11-21T22:10', 'Europe/Helsinki'),
        end: at('2026-11-22T06:40', 'Europe/Helsinki'),
      });
      const sections = nowSections([train, husky], helsinki('02:00'));
      expect(keys(sections.happening)).toEqual(['train']);
      expect(sections.happening[0].role).toBe('full');
      expect(keys(sections.upNext)).toEqual(['husky']);
    });

    it('shows overlapping events together, by start', () => {
      const lunch = item({
        id: 'lunch',
        kind: 'food',
        start: at('2026-11-22T10:30', 'Europe/Helsinki'),
        end: at('2026-11-22T12:00', 'Europe/Helsinki'),
      });
      expect(keys(nowSections([lunch, husky], helsinki('10:45')).happening)).toEqual([
        'husky',
        'lunch',
      ]);
    });

    it('never makes a stay a card: during it, its check-out waits in up next', () => {
      const hotel = item({
        id: 'hotel',
        kind: 'stay',
        start: at('2026-11-20T15:00', 'Europe/Helsinki'),
        end: at('2026-11-24T11:00', 'Europe/Helsinki'),
      });
      const sections = nowSections([hotel], helsinki('12:00'));
      expect(sections.happening).toEqual([]);
      expect(keys(sections.upNext)).toEqual(['hotel:end']);
    });

    it('treats anything longer than a day as a span, like a stay', () => {
      const car = item({
        id: 'car',
        kind: 'transport',
        start: at('2026-11-20T10:00', 'Europe/Helsinki'),
        end: at('2026-11-23T10:00', 'Europe/Helsinki'),
      });
      const sections = nowSections([car], helsinki('12:00'));
      expect(sections.happening).toEqual([]);
      expect(keys(sections.upNext)).toEqual(['car:end']);
    });

    // Real clock changes in Sofia: 25 Oct 2026 lasts 25 hours, 29 Mar 2026 lasts 23 (A3).
    describe('across a clock change', () => {
      const sofia = (local: string) => at(local, 'Europe/Sofia');

      it('keeps a date-only end on until midnight on a 25-hour day', () => {
        const night = item({ id: 'night', start: sofia('2026-10-25T00:30'), end: sofia('2026-10-25') });
        // 23:30, after the 24th elapsed hour but before midnight.
        const lateEvening = new Date('2026-10-25T23:30:00+02:00');
        expect(keys(nowSections([night], lateEvening).happening)).toEqual(['night']);
      });

      it('ends a date-only end at midnight on a 23-hour day, not an hour later', () => {
        const day = item({ id: 'day', start: sofia('2026-03-29T10:00'), end: sofia('2026-03-29') });
        // 00:20 on the next day, past the grace after midnight.
        expect(nowSections([day], new Date('2026-03-30T00:20:00+03:00')).happening).toEqual([]);
        expect(keys(nowSections([day], new Date('2026-03-29T23:50:00+03:00')).happening)).toEqual([
          'day',
        ]);
      });

      it('counts a calendar day, not 24 hours, as the longest event', () => {
        // 09:00 to 09:00 over the night the clocks go back is 25 hours, and still one day.
        const overnight = item({
          id: 'overnight',
          start: sofia('2026-10-24T09:00'),
          end: sofia('2026-10-25T09:00'),
        });
        const evening = new Date('2026-10-24T21:00:00+03:00');
        expect(keys(nowSections([overnight], evening).happening)).toEqual(['overnight']);
      });

      it('still treats more than a calendar day as a span', () => {
        const longer = item({
          id: 'longer',
          start: sofia('2026-10-24T09:00'),
          end: sofia('2026-10-25T09:01'),
        });
        expect(nowSections([longer], new Date('2026-10-24T21:00:00+03:00')).happening).toEqual([]);
      });
    });
  });

  describe('today, no fixed time', () => {
    const santa = item({ id: 'santa', start: at('2026-11-22', 'Europe/Helsinki') });

    it('is up next, not today, the evening before', () => {
      const sections = nowSections([santa], new Date('2026-11-21T23:59:00+02:00'));
      expect(sections.today).toEqual([]);
      expect(keys(sections.upNext)).toEqual(['santa']);
    });

    it('shows all through its day in the item zone, and not in up next', () => {
      for (const time of ['00:00', '12:00', '23:59']) {
        const sections = nowSections([santa], helsinki(time));
        expect(keys(sections.today)).toEqual(['santa']);
        expect(sections.upNext).toEqual([]);
      }
    });

    it('is gone the next day', () => {
      expect(nowSections([santa], new Date('2026-11-23T00:00:00+02:00')).today).toEqual([]);
    });

    it('uses the item zone, not the device or the trip', () => {
      const tokyo = item({ id: 'tokyo', start: at('2026-11-23', 'Asia/Tokyo') });
      // 23:30 on the 22nd in Helsinki is already 06:30 on the 23rd in Tokyo.
      const sections = nowSections([tokyo, santa], helsinki('23:30'));
      expect(keys(sections.today)).toEqual(['santa', 'tokyo']);
    });

    it('shows a multi-day date-only plan on each of its days', () => {
      const pass = item({
        id: 'pass',
        start: at('2026-11-21', 'Europe/Helsinki'),
        end: at('2026-11-23', 'Europe/Helsinki'),
      });
      for (const day of ['2026-11-21', '2026-11-22', '2026-11-23']) {
        const sections = nowSections([pass], new Date(`${day}T12:00:00+02:00`));
        expect(keys(sections.today)).toEqual(['pass']);
        expect(sections.upNext).toEqual([]);
      }
      expect(nowSections([pass], new Date('2026-11-24T12:00:00+02:00')).today).toEqual([]);
    });

    it('puts a dated idea in maybe today, a task in neither, a cancelled plan nowhere', () => {
      const sections = nowSections(
        [
          { ...santa, id: 'idea', status: 'idea' as const },
          { ...santa, id: 'task', kind: 'task' as const },
          { ...santa, id: 'gone', status: 'cancelled' as const },
        ],
        helsinki('12:00'),
      );
      expect(sections.today).toEqual([]);
      expect(keys(sections.maybeToday)).toEqual(['idea']);
      expect(sections.upNext).toEqual([]);
    });
  });
});

describe('happeningNote', () => {
  const ends = (local: string, endTzOverride: string | null = null) => ({
    kind: 'activity' as const,
    start: at('2026-11-22T09:00', 'Europe/Helsinki'),
    end: at(local, 'Europe/Helsinki'),
    endTzOverride,
  });
  const during = new Date('2026-11-22T10:00:00+02:00');

  it('says until when on the same day', () => {
    expect(happeningNote(ends('2026-11-22T11:15'), during)).toBe('Until 11:15');
  });

  it('says ended once it has', () => {
    expect(happeningNote(ends('2026-11-22T09:50'), during)).toBe('Ended 09:50');
  });

  it('names the arrival day and zone of an overnight journey', () => {
    const train = { ...ends('2026-11-23T06:40', 'Europe/Helsinki'), kind: 'transport' as const };
    expect(happeningNote(train, during)).toMatch(/^Arrives .*06:40 · Helsinki$/);
  });

  it('has nothing to say with no end', () => {
    expect(happeningNote({ ...ends('2026-11-22T11:15'), end: null }, during)).toBeNull();
  });
});

describe('todayNote', () => {
  const pass = item({
    id: 'pass',
    start: at('2026-11-21', 'Europe/Helsinki'),
    end: at('2026-11-23', 'Europe/Helsinki'),
  });

  it('says until when on every day but the last', () => {
    expect(todayNote(pass, new Date('2026-11-21T12:00:00+02:00'))).toMatch(/^Until .*23/);
    expect(todayNote(pass, new Date('2026-11-23T12:00:00+02:00'))).toBeNull();
  });
});

describe('doneTasks', () => {
  it('lists completed tasks, most recently ticked first, never open or cancelled ones', () => {
    const items = [
      item({ id: 'old', kind: 'task', completedAt: '2026-11-01T10:00:00.000Z' }),
      item({ id: 'open', kind: 'task' }),
      item({ id: 'new', kind: 'task', completedAt: '2026-11-03T10:00:00.000Z' }),
      item({ id: 'gone', kind: 'task', status: 'cancelled', completedAt: '2026-11-04T10:00:00.000Z' }),
      item({ id: 'tour', completedAt: '2026-11-05T10:00:00.000Z' }),
    ];
    expect(doneTasks(items).map((task) => task.id)).toEqual(['new', 'old']);
  });
});
