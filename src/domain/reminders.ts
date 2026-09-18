/**
 * Which reminder each item gets, and how the scheduled set is brought in line with it. Pure, so
 * the rules are tested in node; `src/notifications/` only hands the result to Android.
 *
 * The rules (decided for S6): travel 3 hours before, a stay on the morning of check-in, an
 * activity, meal or anything else 1 hour before, a task at its own time. A date with no time
 * reminds on that morning. Each item can switch its reminder off.
 */

import { timeOfDay, toInstant, type LocalMoment } from './time';
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

/** Kept in the free-form `details` column: absent means on, so no existing row needs a migration. */
export function isReminderOn(details: Record<string, unknown> | null | undefined): boolean {
  return details?.reminder !== 'off';
}

/** Undefined when nothing else is left, so switching back on does not leave `{}` behind. */
export function withReminder(
  details: Record<string, unknown> | null | undefined,
  on: boolean,
): Record<string, unknown> | undefined {
  const { reminder: _previous, ...rest } = details ?? {};
  const next = on ? rest : { ...rest, reminder: 'off' };
  return Object.keys(next).length > 0 ? next : undefined;
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
  if (start.precision === 'date') return morningOf(start);

  const startsAt = toInstant(start);
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
  if (!isReminderOn(item.details)) return 'Off';
  if (item.kind === 'task' && item.completedAt !== null) return 'Done — no reminder';
  if (item.start.precision === 'date') return `On the morning, at ${MORNING}`;
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
