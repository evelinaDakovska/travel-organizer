/**
 * Derived from TripItems on every read — there is no stored itinerary.
 * Grouping is by LOCAL day, ordering by instant; conflating the two is the bug to avoid.
 */

import { dayKey, timeOfDay, toInstant, type LocalMoment } from './time';
import type { TripItem } from './tripItem';

/** Only the fields the timeline reasons about, so callers can pass partial rows in tests. */
export type TimelineItem = Pick<
  TripItem,
  'id' | 'kind' | 'status' | 'title' | 'start' | 'end' | 'completedAt'
>;

/**
 * `full` is a single-day item. An item ending on a later local day splits into `start` and
 * `end` so a check-out, or an overnight train's arrival, appears on the day it happens.
 */
export type EntryRole = 'full' | 'start' | 'end';

export type TimelineEntry<T extends TimelineItem = TimelineItem> = {
  /** Stable list key. A split item yields two entries, so the id alone is not unique. */
  key: string;
  item: T;
  role: EntryRole;
  moment: LocalMoment;
  /** Derived sort key. Never render this. */
  instant: string;
  /** 'HH:mm' as written, or null when only the date is known. */
  time: string | null;
};

export type TimelineDay<T extends TimelineItem = TimelineItem> = {
  day: string;
  entries: TimelineEntry<T>[];
};

function entryFor<T extends TimelineItem>(
  item: T,
  moment: LocalMoment,
  role: EntryRole,
): TimelineEntry<T> {
  return {
    key: role === 'end' ? `${item.id}:end` : item.id,
    item,
    role,
    moment,
    instant: toInstant(moment),
    time: timeOfDay(moment),
  };
}

function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  if (a.instant !== b.instant) return a.instant < b.instant ? -1 : 1;
  // A date-only item is "some time today", so it sits above a real 00:00 on the same instant.
  if (a.moment.precision !== b.moment.precision) return a.moment.precision === 'date' ? -1 : 1;
  return a.item.title.localeCompare(b.item.title) || a.key.localeCompare(b.key);
}

/**
 * Every dated entry in chronological order, multi-day items already split.
 * Cancelled items are excluded; an undated item has no place on a timeline.
 */
export function timelineEntries<T extends TimelineItem>(
  items: readonly T[],
): TimelineEntry<T>[] {
  const entries: TimelineEntry<T>[] = [];

  for (const item of items) {
    const { start, end } = item;
    if (item.status === 'cancelled' || start === null) continue;

    const splits = end !== null && dayKey(end) !== dayKey(start);
    entries.push(entryFor(item, start, splits ? 'start' : 'full'));
    if (splits && end !== null) entries.push(entryFor(item, end, 'end'));
  }

  return entries.sort(compareEntries);
}

/** Dated items grouped by their local day, both days and entries in order. */
export function buildTimeline<T extends TimelineItem>(items: readonly T[]): TimelineDay<T>[] {
  const byDay = new Map<string, TimelineEntry<T>[]>();

  for (const entry of timelineEntries(items)) {
    const day = dayKey(entry.moment);
    const existing = byDay.get(day);
    if (existing) existing.push(entry);
    else byDay.set(day, [entry]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, entries]) => ({ day, entries }));
}

/**
 * Where the Timeline opens (R7): during the trip, the first day with entries from today on — or
 * null to start at the top, before or after the trip, or when nothing is left from today. `today`
 * is the device's date: this is only where the list starts, and every earlier day stays above it.
 */
export function landingDay(
  days: readonly string[],
  today: string,
  trip: { startDate: string; endDate: string },
): string | null {
  if (today < trip.startDate || today > trip.endDate) return null;
  return days.find((day) => day >= today) ?? null;
}
