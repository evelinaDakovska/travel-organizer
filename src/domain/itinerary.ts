/**
 * What the trip tabs show, derived from items. Built on the timeline's entries, so a hotel's
 * check-out and an item dated before the trip count here exactly as they do on the Timeline.
 */

import { toInstant } from './time';
import { timelineEntries, type TimelineEntry, type TimelineItem } from './timeline';
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

/** Confirmed items with no date yet, which a day-by-day timeline has nowhere to put. */
export function undatedConfirmed<T extends TimelineItem>(items: readonly T[]): T[] {
  return items
    .filter((item) => item.status === 'confirmed' && item.start === null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * How a split entry introduces itself: a stay reads 'Check in' then 'Check out' on the day each
 * happens, a journey 'Departs' then 'Arrives'. A single-day entry needs no prefix.
 */
export function entryRoleLabel(entry: {
  role: TimelineEntry['role'];
  item: Pick<TimelineItem, 'kind'>;
}): string | null {
  if (entry.role === 'full') return null;
  const starting = entry.role === 'start';

  switch (entry.item.kind) {
    case 'stay':
      return starting ? 'Check in' : 'Check out';
    case 'transport':
      return starting ? 'Departs' : 'Arrives';
    default:
      return starting ? 'Starts' : 'Ends';
  }
}

/** Launch opens straight into a trip only when there is no doubt which one. */
export function singleActiveTrip<T extends Trip>(trips: readonly T[], now: Date = new Date()): T | null {
  const active = trips.filter((trip) => isTripActive(trip, now));
  return active.length === 1 ? active[0] : null;
}
