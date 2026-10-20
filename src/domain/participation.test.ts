import type { LocalMoment } from './time';
import type { TripItemKind, TripItemStatus } from './tripItem';
import { joinCandidates, newItemParticipants, offeredOnJoin } from './participation';

const tz = 'Europe/Helsinki';
const at = (local: string): LocalMoment => ({
  local,
  tz,
  precision: local.length === 10 ? 'date' : 'time',
});

function item(
  id: string,
  title: string,
  options: {
    kind?: TripItemKind;
    status?: TripItemStatus;
    start?: string;
    end?: string;
  } = {},
) {
  return {
    id,
    title,
    kind: options.kind ?? 'activity',
    status: options.status ?? 'confirmed',
    start: options.start ? at(options.start) : null,
    end: options.end ? at(options.end) : null,
  };
}

const members = [{ id: 'ev' }, { id: 'ana' }, { id: 'mia' }];
const ids = (items: { id: string }[]) => items.map((entry) => entry.id);

describe('who starts ticked on a new item', () => {
  it.each(['activity', 'transport', 'stay', 'food', 'other'] as const)(
    '%s: every member, in the trip’s order',
    (kind) => {
      expect(newItemParticipants(kind, members)).toEqual(['ev', 'ana', 'mia']);
    },
  );

  it('a to-do starts with nobody', () => {
    expect(newItemParticipants('task', members)).toEqual([]);
  });

  it('a trip with nobody on it starts with nobody', () => {
    expect(newItemParticipants('activity', [])).toEqual([]);
  });

  it('returns a new array: ticking on the form never touches the member list', () => {
    const result = newItemParticipants('activity', members);
    result.pop();
    expect(members).toHaveLength(3);
  });
});

describe('what is offered to someone who joins', () => {
  it('offers plans and saved places, never to-dos or cancelled plans', () => {
    expect(offeredOnJoin({ kind: 'activity', status: 'confirmed' })).toBe(true);
    expect(offeredOnJoin({ kind: 'food', status: 'idea' })).toBe(true);
    expect(offeredOnJoin({ kind: 'task', status: 'confirmed' })).toBe(false);
    expect(offeredOnJoin({ kind: 'activity', status: 'cancelled' })).toBe(false);
  });

  const now = new Date('2026-11-22T10:00:00Z'); // 12:00 in Helsinki

  it('lists upcoming plans soonest first, then undated by title, then past most recent first', () => {
    const result = joinCandidates(
      [
        item('past-old', 'Arrival', { start: '2026-11-20T09:00' }),
        item('soon', 'Husky safari', { start: '2026-11-22T15:00' }),
        item('later', 'Aurora tour', { start: '2026-11-23T21:00' }),
        item('past-recent', 'Breakfast', { start: '2026-11-21T08:00' }),
        item('undated-b', 'Sauna', {}),
        item('undated-a', 'Reindeer farm', {}),
      ],
      now,
    );
    expect(ids(result.plans)).toEqual([
      'soon',
      'later',
      'undated-a',
      'undated-b',
      'past-recent',
      'past-old',
    ]);
    expect(result.places).toEqual([]);
  });

  it('keeps a plan that has started but not ended as upcoming', () => {
    const result = joinCandidates(
      [item('hotel', 'Hotel', { kind: 'stay', start: '2026-11-20T15:00', end: '2026-11-24T11:00' })],
      now,
    );
    expect(ids(result.plans)).toEqual(['hotel']);
    // Upcoming, not past: it is first, before anything undated would be.
    const mixed = joinCandidates(
      [
        item('undated', 'A', {}),
        item('hotel', 'Hotel', { kind: 'stay', start: '2026-11-20T15:00', end: '2026-11-24T11:00' }),
      ],
      now,
    );
    expect(ids(mixed.plans)).toEqual(['hotel', 'undated']);
  });

  it('treats a plan dated today without a time as still ahead, until the day is over', () => {
    const result = joinCandidates(
      [item('undated', 'A', {}), item('today', 'Market day', { start: '2026-11-22' })],
      now,
    );
    expect(ids(result.plans)).toEqual(['today', 'undated']);
    const tomorrow = joinCandidates(
      [item('undated', 'A', {}), item('today', 'Market day', { start: '2026-11-22' })],
      new Date('2026-11-22T22:30:00Z'), // 00:30 on the 23rd in Helsinki
    );
    expect(ids(tomorrow.plans)).toEqual(['undated', 'today']);
  });

  it('lists saved places by title, dated or not, and leaves out to-dos and cancelled plans', () => {
    const result = joinCandidates(
      [
        item('i2', 'Snowmobile', { status: 'idea' }),
        item('i1', 'Arktikum', { status: 'idea', kind: 'activity', start: '2026-11-23' }),
        item('task', 'Print tickets', { kind: 'task' }),
        item('gone', 'Cancelled tour', { status: 'cancelled', start: '2026-11-23T10:00' }),
        item('plan', 'Husky safari', { start: '2026-11-23T10:00' }),
      ],
      now,
    );
    expect(ids(result.places)).toEqual(['i1', 'i2']);
    expect(ids(result.plans)).toEqual(['plan']);
  });

  it('breaks ties by title and then id, so the order is always the same', () => {
    const items = [
      item('b', 'Same', { start: '2026-11-23T10:00' }),
      item('a', 'Same', { start: '2026-11-23T10:00' }),
      item('c', 'Earlier title', { start: '2026-11-23T10:00' }),
    ];
    expect(ids(joinCandidates(items, now).plans)).toEqual(['c', 'a', 'b']);
    expect(ids(joinCandidates([...items].reverse(), now).plans)).toEqual(['c', 'a', 'b']);
  });

  it('offers nothing for an empty trip', () => {
    expect(joinCandidates([], now)).toEqual({ plans: [], places: [] });
  });
});
