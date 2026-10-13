/**
 * The Timeline's day tabs (B3): which stops the rail offers, which one it opens on, and which
 * days each one shows. Navigation only — the timeline itself is still `buildTimeline`, grouped by
 * local day, so an overnight arrival stays on the day it lands (CLAUDE.md §5.3).
 */

import { formatDayHeading } from './format';
import { addCalendarDays } from './time';
import type { TimelineDay, TimelineItem } from './timeline';
import type { Trip } from './trip';

export type DayStop =
  /** Every day, one after another: the whole trip at a glance. */
  | { kind: 'all' }
  /** Anything dated before the first day: check-in reminders, bookings made ahead. */
  | { kind: 'before' }
  | { kind: 'day'; date: string; number: number }
  | { kind: 'after' }
  /** Confirmed, with no date yet. */
  | { kind: 'undated' };

/** A stable key for a stop: its kind, or its date for a trip day. */
export function stopKey(stop: DayStop): string {
  return stop.kind === 'day' ? stop.date : stop.kind;
}

/** Every date of the trip, first to last — days with nothing planned included. */
export function tripDates(trip: Pick<Trip, 'startDate' | 'endDate'>): string[] {
  const dates: string[] = [];
  for (let date = trip.startDate; date <= trip.endDate; date = addCalendarDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/**
 * The rail: All, then Before when anything is dated before the trip, every trip day, After when
 * anything is dated after it, and No date when something confirmed has none. Built from the trip's
 * dates, not from what has entries, so an empty day can still be chosen and planned.
 */
export function dayStops(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  datedDays: readonly string[],
  hasUndated: boolean,
): DayStop[] {
  const stops: DayStop[] = [{ kind: 'all' }];
  if (datedDays.some((day) => day < trip.startDate)) stops.push({ kind: 'before' });
  tripDates(trip).forEach((date, index) => stops.push({ kind: 'day', date, number: index + 1 }));
  if (datedDays.some((day) => day > trip.endDate)) stops.push({ kind: 'after' });
  if (hasUndated) stops.push({ kind: 'undated' });
  return stops;
}

/**
 * Where the rail opens: today during the trip, the first day before it, the last day after it.
 * `today` is the device's date, like the rest of "where are we in the trip".
 */
export function defaultStopKey(trip: Pick<Trip, 'startDate' | 'endDate'>, today: string): string {
  if (today < trip.startDate) return trip.startDate;
  if (today > trip.endDate) return trip.endDate;
  return today;
}

/**
 * The stop to show: the one chosen, while it still exists, else the default. Data refreshing
 * never moves the reader; only a stop that has disappeared (its last item deleted) does.
 */
export function resolveStopKey(
  stops: readonly DayStop[],
  chosen: string | null,
  fallback: string,
): string {
  const keys = stops.map(stopKey);
  if (chosen !== null && keys.includes(chosen)) return chosen;
  return keys.includes(fallback) ? fallback : keys[0];
}

/** The timeline days a stop shows. A trip day with nothing on it gives no days: an empty state. */
export function daysForStop<T extends TimelineItem>(
  stop: DayStop,
  days: readonly TimelineDay<T>[],
  trip: Pick<Trip, 'startDate' | 'endDate'>,
): TimelineDay<T>[] {
  switch (stop.kind) {
    case 'all':
      return [...days];
    case 'before':
      return days.filter((day) => day.day < trip.startDate);
    case 'after':
      return days.filter((day) => day.day > trip.endDate);
    case 'day':
      return days.filter((day) => day.day === stop.date);
    case 'undated':
      return [];
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The two lines of a stop on the rail: 'Day 3' over 'Sun 22', or 'Before' alone. */
export function stopLabels(stop: DayStop): { label: string; sublabel?: string } {
  switch (stop.kind) {
    case 'all':
      return { label: 'All', sublabel: 'days' };
    case 'before':
      return { label: 'Before', sublabel: 'the trip' };
    case 'after':
      return { label: 'After', sublabel: 'the trip' };
    case 'undated':
      return { label: 'No date', sublabel: 'yet' };
    case 'day': {
      const [year, month, day] = stop.date.split('-').map(Number);
      const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
      return { label: `Day ${stop.number}`, sublabel: `${weekday} ${day}` };
    }
  }
}

/** What a screen reader says for a stop: 'Day 3, Sunday, 22 November, today'. */
export function stopDescription(stop: DayStop, today: string): string {
  switch (stop.kind) {
    case 'all':
      return 'All days';
    case 'before':
      return 'Before the trip';
    case 'after':
      return 'After the trip';
    case 'undated':
      return 'No date yet';
    case 'day': {
      const description = `Day ${stop.number}, ${formatDayHeading(stop.date)}`;
      return stop.date === today ? `${description}, today` : description;
    }
  }
}
