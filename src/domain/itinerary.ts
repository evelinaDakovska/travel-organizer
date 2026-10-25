/**
 * What the trip tabs show, derived from items. Built on the timeline's entries, so a hotel's
 * check-out and an item dated before the trip count here exactly as they do on the Timeline.
 */

import { formatShortDate, formatShortMoment } from './format';
import { dayKey, localDateIn, shiftMoment, timeOfDay, toInstant } from './time';
import { timelineEntries, type TimelineEntry, type TimelineItem } from './timeline';
import type { TripItemKind } from './tripItem';
import { routePlace, zoneName } from './zoneHints';
import { isTripActive, type Trip } from './trip';

/** The next confirmed things to be at. Tasks have their own list; ideas are not commitments. */
export function upNext<T extends TimelineItem>(
  items: readonly T[],
  now: Date = new Date(),
  limit = 3,
): TimelineEntry<T>[] {
  const cutoff = now.toISOString();
  return timelineEntries(items)
    .filter((entry) => entry.instant >= cutoff)
    .filter((entry) => entry.item.status === 'confirmed' && entry.item.kind !== 'task')
    .slice(0, limit);
}

/** How long an event with no end stays in Happening now after it starts (review decision 3). */
export const OPEN_ENDED_MINUTES = 60;
/** How long an event stays in Happening now after its end, read as 'Ended 11:15' (decision 4). */
export const ENDED_GRACE_MINUTES = 15;

const MINUTE = 60_000;

export type NowSections<T extends TimelineItem> = {
  /** Timed events on now, or just ended. One entry per item, `role: 'full'`. */
  happening: TimelineEntry<T>[];
  /** Confirmed, date-only, and today in the item's own zone. */
  today: TimelineEntry<T>[];
  /** The same for ideas — kept apart so a maybe never reads as a plan. */
  maybeToday: TimelineEntry<T>[];
  /** Still to come, with nothing above repeated. */
  upNext: TimelineEntry<T>[];
};

/**
 * The instant an item stops being on: its end, or for an end that is a date, midnight starting
 * the next day there — 23 or 25 hours after the date's own midnight across a clock change.
 */
function endInstantOf(item: TimelineItem): number | null {
  const { start, end } = item;
  if (!start) return null;
  if (!end) return Date.parse(toInstant(start)) + OPEN_ENDED_MINUTES * MINUTE;
  if (end.precision === 'time') return Date.parse(toInstant(end));
  return Date.parse(toInstant(shiftMoment(end, 1)));
}

function isHappening(item: TimelineItem, now: number): boolean {
  const { start } = item;
  if (item.status !== 'confirmed' || item.kind === 'task' || item.kind === 'stay') return false;
  if (!start || start.precision !== 'time') return false;
  const begins = Date.parse(toInstant(start));
  const ends = endInstantOf(item)!;
  // Longer than a calendar day, an item is a span rather than an event: its end waits in Up next.
  if (ends > Date.parse(toInstant(shiftMoment(start, 1)))) return false;
  const grace = item.end ? ENDED_GRACE_MINUTES * MINUTE : 0;
  return begins <= now && now < ends + grace;
}

/** A date-only item whose days, in its own zone, include today. */
function isToday(item: TimelineItem, now: Date): boolean {
  const { start, end } = item;
  if (item.kind === 'task' || !start || start.precision !== 'date') return false;
  const today = localDateIn(now, start.tz);
  const last = end ? dayKey(end) : dayKey(start);
  return dayKey(start) <= today && today <= last;
}

const asFull = <T extends TimelineItem>(entry: TimelineEntry<T>): TimelineEntry<T> => ({
  ...entry,
  role: 'full',
  key: entry.item.id,
});

/**
 * What the Now screen shows, top to bottom. `upNext` alone drops an event the moment it starts
 * and a date-only plan at midnight; this keeps the thing you are late for in view (D27).
 */
export function nowSections<T extends TimelineItem>(
  items: readonly T[],
  now: Date = new Date(),
  limit = 3,
): NowSections<T> {
  const at = now.getTime();
  const cutoff = now.toISOString();
  // Each item's first entry: the whole item, or the start of one that spans days.
  const firsts = timelineEntries(items).filter((entry) => entry.role !== 'end');

  const happening = firsts.filter((entry) => isHappening(entry.item, at)).map(asFull);
  const todays = firsts.filter((entry) => isToday(entry.item, now)).map(asFull);
  const today = todays.filter((entry) => entry.item.status === 'confirmed');
  const maybeToday = todays.filter((entry) => entry.item.status === 'idea');

  const shown = new Set([...happening, ...today].map((entry) => entry.item.id));
  const upNextEntries = timelineEntries(items)
    .filter((entry) => entry.instant >= cutoff)
    .filter((entry) => entry.item.status === 'confirmed' && entry.item.kind !== 'task')
    .filter((entry) => !shown.has(entry.item.id))
    .slice(0, limit);

  return { happening, today, maybeToday, upNext: upNextEntries };
}

/**
 * The line under a Happening card: 'Ended 11:15', 'Until 11:15', or for one that ends on another
 * day 'Arrives Sat 22 Nov · 06:40 · Rovaniemi'. Null for one with no end.
 */
export function happeningNote(
  item: Pick<TimelineItem, 'kind' | 'start' | 'end'> & {
    subkind?: string | null;
    endTzOverride: string | null;
    details?: Record<string, unknown> | null;
  },
  now: Date = new Date(),
): string | null {
  const { start, end } = item;
  if (!start || !end) return null;
  const time = timeOfDay(end);
  if (time && Date.parse(toInstant(end)) <= now.getTime()) return `Ended ${time}`;
  const zone = item.endTzOverride ? zoneName(item.endTzOverride, routePlace(item, 'end')) : null;
  const when =
    dayKey(end) === dayKey(start)
      ? `Until ${time ?? 'the end of the day'}`
      : `${entryRoleLabel({ role: 'end', item }) ?? 'Ends'} ${formatShortMoment(end.local, end.precision)}`;
  return [when, zone].filter(Boolean).join(' · ');
}

/** Under a date-only plan that runs over several days: 'Until Mon 24 Nov'. Null on its last day. */
export function todayNote(item: Pick<TimelineItem, 'start' | 'end'>, now: Date = new Date()): string | null {
  const { start, end } = item;
  if (!start || !end || localDateIn(now, start.tz) >= dayKey(end)) return null;
  return `Until ${formatShortDate(dayKey(end))}`;
}

const instantOf = (item: TimelineItem) => (item.start ? toInstant(item.start) : null);

/** Tasks still to do: dated ones first in time order, then undated ones by title. */
export function openTasks<T extends TimelineItem>(items: readonly T[]): T[] {
  return items
    .filter((item) => item.kind === 'task' && item.completedAt === null)
    .filter((item) => item.status !== 'cancelled')
    .sort((a, b) => {
      const [x, y] = [instantOf(a), instantOf(b)];
      if (x !== null && y !== null && x !== y) return x < y ? -1 : 1;
      if ((x === null) !== (y === null)) return x === null ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
}

/** Tasks already done, the most recently ticked first — behind *Show done* on Now (F3). */
export function doneTasks<T extends TimelineItem>(items: readonly T[]): T[] {
  return items
    .filter((item) => item.kind === 'task' && item.completedAt !== null)
    .filter((item) => item.status !== 'cancelled')
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!) || a.title.localeCompare(b.title));
}

/** Confirmed items with no date yet, which a day-by-day timeline has nowhere to put. */
export function undatedConfirmed<T extends TimelineItem>(items: readonly T[]): T[] {
  return items
    .filter((item) => item.status === 'confirmed' && item.start === null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * How a split entry introduces itself: a stay reads 'Check in' then 'Check out' on the day each
 * happens, a journey 'Departs' then 'Arrives', a rental car 'Pick up' then 'Drop off'. A single-day
 * entry needs no prefix.
 */
export function entryRoleLabel(entry: {
  role: TimelineEntry['role'];
  item: Pick<TimelineItem, 'kind'> & { subkind?: string | null };
}): string | null {
  if (entry.role === 'full') return null;
  const starting = entry.role === 'start';

  switch (entry.item.kind) {
    case 'stay':
      return starting ? 'Check in' : 'Check out';
    case 'transport':
      if (entry.item.subkind === 'car') return starting ? 'Pick up' : 'Drop off';
      return starting ? 'Departs' : 'Arrives';
    default:
      return starting ? 'Starts' : 'Ends';
  }
}

/**
 * 'Sofia' when this end of the entry states its own zone, null when it follows the trip. A 06:10
 * departure from Sofia on a Milan trip must not read as 06:10 Milan time. A journey's end is
 * named by its city when the city is in that zone: 'Munich', not 'Berlin' (A6).
 */
export function entryZoneLabel(entry: {
  role: TimelineEntry['role'];
  item: {
    startTzOverride: string | null;
    endTzOverride: string | null;
    kind?: TripItemKind;
    details?: Record<string, unknown> | null;
  };
}): string | null {
  const { item } = entry;
  const end = entry.role === 'end' ? 'end' : 'start';
  const zone = end === 'end' ? item.endTzOverride : item.startTzOverride;
  if (!zone) return null;
  return zoneName(zone, routePlace(item, end));
}

/** Launch opens straight into a trip only when there is no doubt which one. */
export function singleActiveTrip<T extends Trip>(trips: readonly T[], now: Date = new Date()): T | null {
  const active = trips.filter((trip) => isTripActive(trip, now));
  return active.length === 1 ? active[0] : null;
}

/**
 * The trip launch should open, if any. Only while Home is still the screen on top: something opened
 * first — a share, a tapped reminder, a link — stays in front instead of disappearing under the trip
 * (QA D-03).
 */
export function tripToOpenAtLaunch<T extends Trip>(
  trips: readonly T[],
  { homeFocused, now = new Date() }: { homeFocused: boolean; now?: Date },
): T | null {
  return homeFocused ? singleActiveTrip(trips, now) : null;
}
