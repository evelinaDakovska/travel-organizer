import {
  isReminderOn,
  MAX_SCHEDULED,
  planReminderSync,
  reminderFor,
  reminderLabel,
  remindersFor,
  withReminder,
  type Reminder,
} from './reminders';
import type { LocalMoment } from './time';
import type { TripItem } from './tripItem';

const at = (local: string, tz = 'Europe/Rome'): LocalMoment => ({
  local,
  tz,
  precision: local.includes('T') ? 'time' : 'date',
});

type Item = Parameters<typeof reminderFor>[0];

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    kind: 'activity',
    status: 'confirmed',
    title: overrides.id,
    start: null,
    completedAt: null,
    details: null,
    ...overrides,
  } satisfies Pick<TripItem, keyof Item>;
}

/** 10:00 in Rome, 11:00 in Sofia. */
const NOW = new Date('2026-09-19T08:00:00Z');

describe('reminderFor — when it fires', () => {
  it('reminds of travel 3 hours before departure, in the zone of departure', () => {
    const flight = item({
      id: 'flight',
      kind: 'transport',
      start: at('2026-09-20T06:10', 'Europe/Sofia'),
    });
    // 06:10 Sofia is 03:10Z; three hours earlier is 00:10Z.
    expect(reminderFor(flight, NOW)?.fireAt).toBe('2026-09-20T00:10:00.000Z');
  });

  it('reminds of an activity or a meal 1 hour before', () => {
    expect(reminderFor(item({ id: 'duomo', start: at('2026-09-19T15:00') }), NOW)?.fireAt).toBe(
      '2026-09-19T12:00:00.000Z',
    );
    expect(
      reminderFor(item({ id: 'dinner', kind: 'food', start: at('2026-09-19T20:00') }), NOW)?.fireAt,
    ).toBe('2026-09-19T17:00:00.000Z');
  });

  it('reminds of a task at its own time', () => {
    const task = item({ id: 'checkin', kind: 'task', start: at('2026-09-19T18:00') });
    expect(reminderFor(task, NOW)?.fireAt).toBe('2026-09-19T16:00:00.000Z');
  });

  it('reminds of a stay on the morning of check-in, whatever time check-in is', () => {
    const hotel = item({ id: 'hotel', kind: 'stay', start: at('2026-09-20T15:00') });
    expect(reminderFor(hotel, NOW)?.fireAt).toBe('2026-09-20T07:00:00.000Z'); // 09:00 Rome
  });

  it('reminds at the check-in itself when it is earlier than the morning', () => {
    const early = item({ id: 'early', kind: 'stay', start: at('2026-09-20T07:30') });
    expect(reminderFor(early, NOW)?.fireAt).toBe('2026-09-20T05:30:00.000Z');
  });

  it('reminds of anything with only a date on that morning, in its own zone', () => {
    const train = item({ id: 'train', kind: 'transport', start: at('2026-09-21', 'Europe/Sofia') });
    expect(reminderFor(train, NOW)?.fireAt).toBe('2026-09-21T06:00:00.000Z'); // 09:00 Sofia
  });
});

describe('reminderFor — when it does not', () => {
  const later = at('2026-09-20T12:00');

  it('skips ideas and cancelled items', () => {
    expect(reminderFor(item({ id: 'a', status: 'idea', start: later }), NOW)).toBeNull();
    expect(reminderFor(item({ id: 'b', status: 'cancelled', start: later }), NOW)).toBeNull();
  });

  it('skips undated items', () => {
    expect(reminderFor(item({ id: 'c' }), NOW)).toBeNull();
  });

  it('skips a finished task', () => {
    const done = item({ id: 'd', kind: 'task', start: later, completedAt: '2026-09-18T10:00:00Z' });
    expect(reminderFor(done, NOW)).toBeNull();
  });

  it('skips an item whose reminder is switched off', () => {
    expect(
      reminderFor(item({ id: 'e', start: later, details: { reminder: 'off' } }), NOW),
    ).toBeNull();
  });

  it('skips a reminder whose moment has already passed, even if the item has not', () => {
    // 10:30 today: the one-hour reminder was at 09:30, before now.
    expect(reminderFor(item({ id: 'f', start: at('2026-09-19T10:30') }), NOW)).toBeNull();
  });
});

describe('reminderFor — what it says', () => {
  it('writes the wall-clock time as it is on the ticket', () => {
    const flight = item({
      id: 'W6 4315',
      kind: 'transport',
      start: at('2026-09-20T06:10', 'Europe/Sofia'),
    });
    expect(reminderFor(flight, NOW)).toMatchObject({ title: 'W6 4315', body: 'Departs at 06:10' });
  });

  it('words each kind for what it is', () => {
    const body = (overrides: Partial<Item>) =>
      reminderFor(item({ id: 'x', ...overrides }), NOW)?.body;
    expect(body({ kind: 'stay', start: at('2026-09-20T15:00') })).toBe('Check in today from 15:00');
    expect(body({ kind: 'stay', start: at('2026-09-20') })).toBe('Check in today');
    expect(body({ kind: 'task', start: at('2026-09-20') })).toBe('To do today');
    expect(body({ kind: 'food', start: at('2026-09-20T20:00') })).toBe('Starts at 20:00');
    expect(body({ kind: 'transport', start: at('2026-09-20') })).toBe('Departs today');
  });
});

describe('remindersFor', () => {
  it('orders reminders nearest first and caps how many are scheduled', () => {
    const many = Array.from({ length: MAX_SCHEDULED + 5 }, (_, i) =>
      item({ id: `i${i}`, start: at(`2026-10-${String((i % 28) + 1).padStart(2, '0')}T12:00`) }),
    );
    const reminders = remindersFor(many, NOW);
    expect(reminders).toHaveLength(MAX_SCHEDULED);
    const times = reminders.map((r) => r.fireAt);
    expect([...times].sort()).toEqual(times);
  });
});

describe('the per-item switch', () => {
  it('is on unless it was switched off', () => {
    expect(isReminderOn(null)).toBe(true);
    expect(isReminderOn({ from: 'Sofia' })).toBe(true);
    expect(isReminderOn({ reminder: 'off' })).toBe(false);
  });

  it('keeps the other details when toggled, and leaves nothing behind when switched back on', () => {
    expect(withReminder({ from: 'Sofia' }, false)).toEqual({ from: 'Sofia', reminder: 'off' });
    expect(withReminder({ from: 'Sofia', reminder: 'off' }, true)).toEqual({ from: 'Sofia' });
    expect(withReminder({ reminder: 'off' }, true)).toBeUndefined();
    expect(withReminder(undefined, false)).toEqual({ reminder: 'off' });
  });
});

describe('reminderLabel', () => {
  const label = (overrides: Partial<Item>) => reminderLabel(item({ id: 'x', ...overrides }));

  it('says the rule in words', () => {
    expect(label({ kind: 'transport', start: at('2026-09-20T06:10') })).toBe('3 hours before');
    expect(label({ start: at('2026-09-20T15:00') })).toBe('1 hour before');
    expect(label({ kind: 'task', start: at('2026-09-20T15:00') })).toBe('At the time');
    expect(label({ kind: 'stay', start: at('2026-09-20T15:00') })).toBe(
      'On the morning of check-in, at 09:00',
    );
    expect(label({ start: at('2026-09-20') })).toBe('On the morning, at 09:00');
    expect(label({ start: at('2026-09-20'), details: { reminder: 'off' } })).toBe('Off');
  });

  it('has nothing to say for an item that cannot remind', () => {
    expect(label({ status: 'idea', start: at('2026-09-20') })).toBeNull();
    expect(label({})).toBeNull();
  });
});

describe('planReminderSync', () => {
  const r = (id: string, fireAt: string, body = 'Starts at 12:00'): Reminder => ({
    id,
    itemId: id,
    fireAt,
    title: id,
    body,
  });

  it('schedules what is missing and cancels what is no longer wanted', () => {
    const plan = planReminderSync(
      [r('keep', '2026-09-20T10:00:00.000Z'), r('new', '2026-09-21T10:00:00.000Z')],
      [r('keep', '2026-09-20T10:00:00.000Z'), r('gone', '2026-09-22T10:00:00.000Z')],
    );
    expect(plan.cancel).toEqual(['gone']);
    expect(plan.schedule.map((x) => x.id)).toEqual(['new']);
  });

  it('replaces a reminder whose time or wording changed', () => {
    const plan = planReminderSync(
      [
        r('moved', '2026-09-20T11:00:00.000Z'),
        r('renamed', '2026-09-20T12:00:00.000Z', 'Starts at 13:00'),
      ],
      [r('moved', '2026-09-20T10:00:00.000Z'), r('renamed', '2026-09-20T12:00:00.000Z')],
    );
    expect(plan.cancel).toEqual(['moved', 'renamed']);
    expect(plan.schedule.map((x) => x.id)).toEqual(['moved', 'renamed']);
  });

  it('does nothing when the two already agree', () => {
    const same = [r('a', '2026-09-20T10:00:00.000Z')];
    expect(planReminderSync(same, same)).toEqual({ cancel: [], schedule: [] });
  });
});
