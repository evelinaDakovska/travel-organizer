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
 * What the Now card shows. Deliberately not scoped to the trip's date range: a flight
 * check-in the day before the trip is exactly what you need to be reminded of.
 */
export function nextEntries<T extends TimelineItem>(
  items: readonly T[],
  now: Date = new Date(),
  limit = 2,
): TimelineEntry<T>[] {
  const cutoff = now.toISOString();

  return timelineEntries(items)
    .filter((entry) => entry.instant >= cutoff)
    .filter((entry) => !(entry.item.kind === 'task' && entry.item.completedAt !== null))
    .slice(0, limit);
}

/** Whole minutes until an entry, reusing its instant. Negative once it has passed. */
export function minutesUntilEntry(entry: TimelineEntry, now: Date = new Date()): number {
  return Math.round((Date.parse(entry.instant) - now.getTime()) / 60_000);
}

/** The entries for one local day, for the Overview's TODAY section. */
export function entriesOnDay<T extends TimelineItem>(
  days: readonly TimelineDay<T>[],
  day: string,
): TimelineEntry<T>[] {
  return days.find((d) => d.day === day)?.entries ?? [];
}
