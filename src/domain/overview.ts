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
 * next (excluding stays, which have their own dedicated accommodation section). A trip without
 * dates counts as before.
 * `limit` caps the rows of what comes next.
 */
export function overviewPlan<T extends TimelineItem & { subkind?: string | null }>(
  items: readonly T[],
  trip: Pick<Trip, 'startDate'>,
  now: Date = new Date(),
  limit = 4,
): OverviewPlan<T> {
  const sections = nowSections(items, now, limit + 2);

  let lead: OverviewPlan<T>['lead'] = null;
  // A trip without dates is laid out as before one (P6-5): nothing is under way yet.
  const isBefore = trip.startDate === null || deviceToday(now) < trip.startDate;

  if (isBefore) {
    const departure = firstDeparture(items, now);
    if (departure) {
      lead = { entry: departure, reason: 'firstDeparture' };
    } else {
      const firstEntry = sections.upNext.find((e) => e.item.kind !== 'stay');
      if (firstEntry) lead = { entry: firstEntry, reason: 'next' };
    }
  } else {
    // Ongoing trip:
    // 1. Current event on now (non-stay)
    const happeningEntry = sections.happening.find((e) => e.item.kind !== 'stay');
    if (happeningEntry) {
      lead = { entry: happeningEntry, reason: 'happening' };
    } else {
      // 2. Next scheduled confirmed event (non-stay)
      const nextEntry = sections.upNext.find((e) => e.item.kind !== 'stay');
      if (nextEntry) {
        lead = { entry: nextEntry, reason: 'next' };
      }
    }
  }

  const notLead = (entry: TimelineEntry<T>) =>
    entry.key !== lead?.entry.key && entry.item.kind !== 'stay';
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
 * a journey always says its arrival — 'Arrives 12:15', or 'Arrives Sat 21 Nov · 07:40' overnight —
 * since the arrival is the next thing a traveller needs, with that end's clock when it is not the
 * trip's: 'Arrives 12:15 · Helsinki time'. Null when there is no end, or the lead is itself an end.
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
  // The trip's own zone is not named, as at the start and under a Happening card (QA O-01).
  const zone = item.endTzOverride ? `${zoneName(end.tz, routePlace(item, 'end'))} time` : null;
  return [`${label} ${when}`, time ? zone : null].filter(Boolean).join(' · ');
}

export type OverviewStayResolution<T extends TimelineItem> =
  | {
      type: 'current';
      stay: T;
      status: 'checked_in' | 'checkin_today';
      checkinTime: string | null;
    }
  | {
      type: 'upcoming';
      stay: T;
      status: 'checkin_today' | 'next_stay';
      checkinDay: string;
      checkinTime: string | null;
    }
  | {
      type: 'overnight_transport';
      transport: T;
    }
  | {
      type: 'none';
    };

/**
 * Resolves accommodation for an ongoing trip:
 * - Tonight's current stay (distinguishing checked in vs check-in later today)
 * - Overnight transport (train/flight) if covering tonight
 * - Next upcoming stay if there is a gap or before the first check-in
 * - None if no stays exist
 */
export function resolveStayForOverview<T extends TimelineItem>(
  items: readonly T[],
  today: string,
  now: Date = new Date(),
): OverviewStayResolution<T> {
  const current = baseTonight(items, today);
  if (current && current.start) {
    const checkin = dayKey(current.start);
    const time = timeOfDay(current.start);
    if (checkin === today && current.start.precision === 'time') {
      const isPast = Date.parse(toInstant(current.start)) <= now.getTime();
      return {
        type: 'current',
        stay: current,
        status: isPast ? 'checked_in' : 'checkin_today',
        checkinTime: time,
      };
    }
    return {
      type: 'current',
      stay: current,
      status: 'checked_in',
      checkinTime: time,
    };
  }

  // Check if tonight is spent on an overnight transport
  const overnightTransport = items.find(
    (item) =>
      item.status === 'confirmed' &&
      item.kind === 'transport' &&
      item.start &&
      item.end &&
      dayKey(item.start) <= today &&
      dayKey(item.end) > today,
  );
  if (overnightTransport) {
    return {
      type: 'overnight_transport',
      transport: overnightTransport,
    };
  }

  // If no current stay and no overnight transport, check for upcoming stays
  const upcomingStays = items
    .filter(
      (item) =>
        item.status === 'confirmed' &&
        item.kind === 'stay' &&
        item.start &&
        dayKey(item.start) >= today,
    )
    .sort((a, b) => toInstant(a.start!).localeCompare(toInstant(b.start!)));

  if (upcomingStays.length > 0) {
    const nextStay = upcomingStays[0];
    const checkinDay = dayKey(nextStay.start!);
    const time = timeOfDay(nextStay.start!);
    return {
      type: 'upcoming',
      stay: nextStay,
      status: checkinDay === today ? 'checkin_today' : 'next_stay',
      checkinDay,
      checkinTime: time,
    };
  }

  return { type: 'none' };
}

export type PastTripSummary = {
  placesCount: number;
  totalSpentByCurrency: Record<string, number>;
};

/** Computes clean summary figures for an ended trip. */
export function pastTripSummary<T extends { kind: string; status: string }>(
  items: readonly T[],
  expenses: readonly { amount: number; currency: string }[],
): PastTripSummary {
  const placesCount = items.filter(
    (item) => item.status === 'confirmed' && item.kind !== 'task',
  ).length;

  const totalSpentByCurrency: Record<string, number> = {};
  for (const exp of expenses) {
    totalSpentByCurrency[exp.currency] = (totalSpentByCurrency[exp.currency] ?? 0) + exp.amount;
  }

  return {
    placesCount,
    totalSpentByCurrency,
  };
}
