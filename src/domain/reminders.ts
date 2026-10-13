/**
 * Which reminder each item gets, and how the scheduled set is brought in line with it. Pure, so
 * the rules are tested in node; `src/notifications/` only hands the result to Android.
 *
 * The rules (decided for S6): travel 3 hours before, a stay on the morning of check-in, an
 * activity, meal or anything else 1 hour before, a task at its own time. A date with no time
 * reminds on that morning. Each item can switch its reminder off, or pick its own time (U3).
 */

import { shiftMoment, timeOfDay, toInstant, type LocalMoment } from './time';
import type { TripItem, TripItemKind } from './tripItem';

/** Minutes before a timed start. A stay is absent: it always reminds on the morning. */
const LEAD_MINUTES: Record<Exclude<TripItemKind, 'stay'>, number> = {
  transport: 180,
  activity: 60,
  food: 60,
  other: 60,
  task: 0,
};

/** Wall-clock "morning", in the item's own zone — the zone the day is lived in. */
export const MORNING = '09:00';

/** Android stops accepting alarms from one app at around 500; the nearest few are what matter. */
export const MAX_SCHEDULED = 64;

export type Reminder = {
  /** One reminder per item, so the item id is the notification id. */
  id: string;
  itemId: string;
  /** UTC instant, ISO. */
  fireAt: string;
  title: string;
  body: string;
};

type ReminderItem = Pick<
  TripItem,
  'id' | 'kind' | 'status' | 'title' | 'start' | 'completedAt' | 'details'
>;

/**
 * What an item asks for, kept in `details.reminder`. Absent is `'default'` — the by-kind rule —
 * so every row written before the choice existed means exactly what it meant then, with no
 * migration. A value this version does not know (a backup from a later one) also reads as default.
 */
export const REMINDER_SETTINGS = [
  'default',
  'at',
  '15m',
  '30m',
  '1h',
  '3h',
  'morning',
  'day-before',
  'off',
] as const;
export type ReminderSetting = (typeof REMINDER_SETTINGS)[number];

/** Minutes before a timed start, for the settings that are a fixed lead. */
const SETTING_LEAD: Partial<Record<ReminderSetting, number>> = {
  at: 0,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '3h': 180,
};

type Details = Record<string, unknown> | null | undefined;

export function reminderSetting(details: Details): ReminderSetting {
  const value = details?.reminder;
  return REMINDER_SETTINGS.includes(value as ReminderSetting) && value !== 'default'
    ? (value as ReminderSetting)
    : 'default';
}

export function isReminderOn(details: Details): boolean {
  return reminderSetting(details) !== 'off';
}

/**
 * The default is stored as nothing at all, and undefined comes back when nothing else is left,
 * so choosing the default again does not leave `{}` behind.
 */
export function withReminderSetting(
  details: Details,
  setting: ReminderSetting,
): Record<string, unknown> | undefined {
  const { reminder: _previous, ...rest } = details ?? {};
  const next = setting === 'default' ? rest : { ...rest, reminder: setting };
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The on/off switch as it was before U3: on means the default rule. */
export function withReminder(details: Details, on: boolean): Record<string, unknown> | undefined {
  return withReminderSetting(details, on ? 'default' : 'off');
}

const SETTING_LABELS: Record<ReminderSetting, string> = {
  default: 'Usual',
  at: 'At the time',
  '15m': '15 min before',
  '30m': '30 min before',
  '1h': '1 hour before',
  '3h': '3 hours before',
  morning: 'That morning',
  'day-before': 'The day before',
  off: 'No reminder',
};

export function reminderSettingLabel(setting: ReminderSetting): string {
  return SETTING_LABELS[setting];
}

/** Only booked, dated, still-open items remind. */
function canRemind(item: ReminderItem): item is ReminderItem & { start: LocalMoment } {
  if (item.status !== 'confirmed' || item.start === null) return false;
  if (item.kind === 'task' && item.completedAt !== null) return false;
  return isReminderOn(item.details);
}

function morningOf(start: LocalMoment): string {
  return toInstant({
    local: `${start.local.slice(0, 10)}T${MORNING}`,
    tz: start.tz,
    precision: 'time',
  });
}

function fireAtFor(item: ReminderItem & { start: LocalMoment }): string {
  const { start } = item;
  const setting = reminderSetting(item.details);

  if (setting === 'day-before') {
    // On the wall clock, not 24 hours: across a clock change those differ by one.
    const previous = shiftMoment(start, -1);
    return previous.precision === 'date' ? morningOf(previous) : toInstant(previous);
  }
  if (start.precision === 'date') return morningOf(start);

  const startsAt = toInstant(start);
  const lead = SETTING_LEAD[setting];
  if (lead !== undefined) return new Date(Date.parse(startsAt) - lead * 60_000).toISOString();
  if (setting === 'morning') {
    const morning = morningOf(start);
    return morning < startsAt ? morning : startsAt;
  }

  if (item.kind === 'stay') {
    // A check-in earlier than the morning reminds at the check-in itself.
    const morning = morningOf(start);
    return morning < startsAt ? morning : startsAt;
  }
  return new Date(Date.parse(startsAt) - LEAD_MINUTES[item.kind] * 60_000).toISOString();
}

function bodyFor(item: ReminderItem & { start: LocalMoment }): string {
  const time = timeOfDay(item.start);
  switch (item.kind) {
    case 'transport':
      return time ? `Departs at ${time}` : 'Departs today';
    case 'stay':
      return time ? `Check in today from ${time}` : 'Check in today';
    case 'task':
      return time ? `To do at ${time}` : 'To do today';
    default:
      return time ? `Starts at ${time}` : 'Today';
  }
}

/** The reminder this item should have right now, or null — including when its moment has passed. */
export function reminderFor(item: ReminderItem, now: Date): Reminder | null {
  if (!canRemind(item)) return null;
  const fireAt = fireAtFor(item);
  if (Date.parse(fireAt) <= now.getTime()) return null;
  return { id: item.id, itemId: item.id, fireAt, title: item.title, body: bodyFor(item) };
}

/** Every reminder due, nearest first, capped at `MAX_SCHEDULED`. */
export function remindersFor(items: readonly ReminderItem[], now: Date): Reminder[] {
  return items
    .map((item) => reminderFor(item, now))
    .filter((r): r is Reminder => r !== null)
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
    .slice(0, MAX_SCHEDULED);
}

/**
 * For item detail: what the rule is, in words, so the time never has to be worked out by hand.
 * Null when the item cannot have a reminder at all (not booked, or no date).
 */
export function reminderLabel(item: ReminderItem): string | null {
  if (item.status !== 'confirmed' || item.start === null) return null;
  const setting = reminderSetting(item.details);
  if (setting === 'off') return 'Off';
  if (item.kind === 'task' && item.completedAt !== null) return 'Done — no reminder';
  if (setting === 'day-before') {
    return item.start.precision === 'date' ? `The day before, at ${MORNING}` : 'The day before, same time';
  }
  if (item.start.precision === 'date') return `On the morning, at ${MORNING}`;
  if (setting === 'morning') return `On the morning, at ${MORNING}`;
  if (setting !== 'default') return setting === 'at' ? 'At the time' : SETTING_LABELS[setting];
  if (item.kind === 'stay') return `On the morning of check-in, at ${MORNING}`;
  const lead = LEAD_MINUTES[item.kind];
  if (lead === 0) return 'At the time';
  return lead % 60 === 0
    ? `${lead / 60} hour${lead === 60 ? '' : 's'} before`
    : `${lead} minutes before`;
}

/** What the scheduler currently holds for one of our reminders. */
export type ScheduledReminder = Pick<Reminder, 'id' | 'fireAt' | 'title' | 'body'>;

export type ReminderSync = { cancel: string[]; schedule: Reminder[] };

/**
 * Reconciles instead of tracking every write: whatever changed an item — an edit, a cancel, an
 * import, a trip's zone — the next sync lands on the right set. A changed reminder is cancelled
 * and scheduled again under the same id.
 */
export function planReminderSync(
  desired: readonly Reminder[],
  scheduled: readonly ScheduledReminder[],
): ReminderSync {
  const wanted = new Map(desired.map((r) => [r.id, r]));
  const same = (a: ScheduledReminder, b: ScheduledReminder) =>
    a.fireAt === b.fireAt && a.title === b.title && a.body === b.body;

  const cancel = scheduled
    .filter((s) => {
      const w = wanted.get(s.id);
      return !w || !same(s, w);
    })
    .map((s) => s.id);

  const current = new Map(scheduled.map((s) => [s.id, s]));
  const schedule = desired.filter((r) => {
    const s = current.get(r.id);
    return !s || !same(s, r);
  });

  return { cancel, schedule };
}
