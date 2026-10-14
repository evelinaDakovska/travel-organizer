/**
 * What the Overview tab leads with (B5), on top of `nowSections`. One highlighted entry — the
 * thing happening, or the next commitment, or before the trip the first departure — then its
 * peers as plain rows, and the stay to go back to tonight.
 */

import { formatShortMoment } from './format';
import { entryRoleLabel, happeningNote, nowSections } from './itinerary';
import { dayKey, timeOfDay, toInstant } from './time';
import { timelineEntries, type TimelineEntry, type TimelineItem } from './timeline';
import { deviceToday, type Trip } from './trip';
import type { TripItem } from './tripItem';
import { routePlace, zoneName } from './zoneHints';

export type LeadReason = 'happening' | 'next' | 'firstDeparture';

export type OverviewPlan<T extends TimelineItem> = {
  lead: { entry: TimelineEntry<T>; reason: LeadReason } | null;
  /** Other things on right now, the lead left out. */
  alsoHappening: TimelineEntry<T>[];
  /** What comes next, the lead left out. */
  next: TimelineEntry<T>[];
  /** Confirmed date-only plans for today, in the item's own zone. */
  today: TimelineEntry<T>[];
  /** The same for ideas. */
  maybeToday: TimelineEntry<T>[];
};

/**
 * Before the trip, the lead is the first journey still to come — the one to get to the airport
 * for — even if an activity is booked earlier. During and after it, what is on now, else what is
 * next. `limit` caps the rows of what comes next.
 */
export function overviewPlan<T extends TimelineItem & { subkind?: string | null }>(
  items: readonly T[],
  trip: Pick<Trip, 'startDate'>,
  now: Date = new Date(),
  limit = 4,
): OverviewPlan<T> {
  const sections = nowSections(items, now, limit + 1);

  let lead: OverviewPlan<T>['lead'] = null;
  if (deviceToday(now) < trip.startDate) {
    const departure = firstDeparture(items, now);
    if (departure) lead = { entry: departure, reason: 'firstDeparture' };
  }
  if (!lead && sections.happening.length > 0) {
    lead = { entry: sections.happening[0], reason: 'happening' };
  }
  if (!lead && sections.upNext.length > 0) lead = { entry: sections.upNext[0], reason: 'next' };

  const notLead = (entry: TimelineEntry<T>) => entry.key !== lead?.entry.key;
  return {
    lead,
    alsoHappening: sections.happening.filter(notLead),
    next: sections.upNext.filter(notLead).slice(0, limit),
    today: sections.today,
    maybeToday: sections.maybeToday,
  };
}

/** The first confirmed journey that has not left yet. */
function firstDeparture<T extends TimelineItem>(
  items: readonly T[],
  now: Date,
): TimelineEntry<T> | null {
  const cutoff = now.toISOString();
  return (
    timelineEntries(items).find(
      (entry) =>
        entry.item.kind === 'transport' &&
        entry.item.status === 'confirmed' &&
        entry.role !== 'end' &&
        entry.instant >= cutoff,
    ) ?? null
  );
}

/**
 * The stay to sleep at tonight (B5, FB-9): confirmed, checked in on or before `today` and checking
 * out after it — on check-out day you no longer sleep there. A stay with no end covers only its
 * first night. When two overlap (a late check-out, an early check-in), the one begun last is
 * tonight's. An undated stay is left out: it cannot be placed on a night.
 */
export function baseTonight<T extends TimelineItem>(items: readonly T[], today: string): T | null {
  const covering = items.filter((item) => {
    if (item.kind !== 'stay' || item.status !== 'confirmed' || !item.start) return false;
    const first = dayKey(item.start);
    const checkout = item.end ? dayKey(item.end) : null;
    return first <= today && (checkout ? today < checkout : today === first);
  });
  covering.sort(
    (a, b) =>
      toInstant(b.start!).localeCompare(toInstant(a.start!)) ||
      (b.end ? toInstant(b.end) : '').localeCompare(a.end ? toInstant(a.end) : '') ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
  return covering[0] ?? null;
}

/**
 * Where you will sleep and what you will drive (B5): confirmed stays and car rentals that have not
 * ended, in order — the quick-access rows before the trip. Not event cards: they span days.
 */
export function staysAndRentals<T extends TimelineItem & { subkind?: string | null }>(
  items: readonly T[],
  now: Date = new Date(),
): T[] {
  const cutoff = now.getTime();
  return items
    .filter((item) => item.status === 'confirmed' && item.start)
    .filter((item) => item.kind === 'stay' || (item.kind === 'transport' && item.subkind === 'car'))
    .filter((item) => Date.parse(toInstant(item.end ?? item.start!)) >= cutoff)
    .sort((a, b) => toInstant(a.start!).localeCompare(toInstant(b.start!)));
}

type NoteItem = Pick<TripItem, 'kind' | 'subkind' | 'details' | 'endTzOverride'> & TimelineItem;

/**
 * The line under the lead (B5). On now: 'Until 11:15', as on the timeline. Otherwise where it ends:
 * a journey always says its arrival and that end's clock — 'Arrives 12:15 · Helsinki time', or
 * 'Arrives Sat 21 Nov · 07:40 · Rovaniemi time' overnight — since the arrival is the next thing a
 * traveller needs. Null when there is no end, or the lead is itself an end.
 */
export function leadNote<T extends NoteItem>(
  entry: TimelineEntry<T>,
  reason: LeadReason,
  now: Date = new Date(),
): string | null {
  const { item } = entry;
  if (reason === 'happening') return happeningNote(item, now);
  const { start, end } = item;
  if (!start || !end || entry.role === 'end') return null;

  const sameDay = dayKey(end) === dayKey(start);
  const time = timeOfDay(end);
  const when = sameDay && time ? time : formatShortMoment(end.local, end.precision);
  const role = entryRoleLabel({ role: 'end', item }) ?? 'Ends';
  const label = role === 'Ends' ? 'Until' : role;
  const zone =
    item.kind === 'transport' || item.endTzOverride
      ? `${zoneName(end.tz, routePlace(item, 'end'))} time`
      : null;
  return [`${label} ${when}`, time ? zone : null].filter(Boolean).join(' · ');
}
