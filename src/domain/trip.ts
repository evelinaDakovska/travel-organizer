import { z } from 'zod';

import { calendarDaysBetween, isValidLocal, toInstant } from './time';
import { isResolvableTimezone } from './timezones';
import { transportDetails, type TripItem } from './tripItem';

export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  startDate: string;
  endDate: string;
  defaultTz: string;
  coverPath: string | null;
  notes: string | null;
  travellerCount: number | null;
  travellers: string[];
  createdAt: string;
  updatedAt: string;
};

const isoDate = z.string().refine((v) => isValidLocal(v, 'date'), 'Use a YYYY-MM-DD date');

export const tripInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the trip a name').max(80),
    destination: z.string().trim().max(80).optional(),
    startDate: isoDate,
    endDate: isoDate,
    defaultTz: z.string().refine(isResolvableTimezone, 'Not a valid timezone'),
    travellerCount: z.number().int().min(1).max(50).optional(),
    travellers: z.array(z.string().trim().min(1)).max(50).optional(),
    notes: z.string().trim().optional(),
  })
  .refine((t) => t.endDate >= t.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  });

export type TripInput = z.infer<typeof tripInputSchema>;

export type TripRow = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  default_tz: string;
  cover_path: string | null;
  notes: string | null;
  traveller_count: number | null;
  travellers: string | null;
  created_at: string;
  updated_at: string;
};

export function parseTripRow(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    defaultTz: row.default_tz,
    coverPath: row.cover_path,
    notes: row.notes,
    travellerCount: row.traveller_count,
    travellers: parseTravellers(row.travellers),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Tolerates malformed JSON rather than breaking the whole trip list. */
function parseTravellers(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** Inclusive whole-day count, the way a traveller counts nights-plus-one. */
export function tripDurationDays(trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  const start = Date.parse(`${trip.startDate}T00:00:00Z`);
  const end = Date.parse(`${trip.endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Where today falls against the trip (F3), on the device's date like `isTripActive`. */
export type TripPhase =
  | { phase: 'before'; daysToGo: number }
  | { phase: 'during'; day: number; of: number }
  | { phase: 'after' };

export function tripPhase(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  now: Date = new Date(),
): TripPhase {
  const today = deviceToday(now);
  if (today < trip.startDate) {
    return { phase: 'before', daysToGo: calendarDaysBetween(today, trip.startDate) };
  }
  if (today > trip.endDate) return { phase: 'after' };
  const day = calendarDaysBetween(trip.startDate, today) + 1;
  return { phase: 'during', day, of: tripDurationDays(trip) };
}

/** 'In 39 days', 'Tomorrow', 'Day 2 of 5', 'Ended' — the band on top of Now. */
export function tripPhaseLabel(phase: TripPhase): string {
  switch (phase.phase) {
    case 'before':
      return phase.daysToGo === 1 ? 'Tomorrow' : `In ${phase.daysToGo} days`;
    case 'during':
      return `Day ${phase.day} of ${phase.of}`;
    case 'after':
      return 'Ended';
  }
}

/**
 * Upcoming keeps trips that have not finished, soonest first; past is most recent first.
 * The boundary uses the device's local date — while travelling the device zone is the trip zone.
 */
export function groupTrips(
  trips: Trip[],
  now: Date = new Date(),
): { upcoming: Trip[]; past: Trip[] } {
  const today = deviceToday(now);

  const upcoming = trips
    .filter((t) => t.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = trips
    .filter((t) => t.endDate < today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate));

  return { upcoming, past };
}

/** The device's local date as 'YYYY-MM-DD' — what "today" means to the person holding it. */
export function deviceToday(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function isTripActive(trip: Trip, now: Date = new Date()): boolean {
  const today = deviceToday(now);
  return trip.startDate <= today && today <= trip.endDate;
}

/**
 * The day a new item's date picker opens on: today while the trip is under way, otherwise the
 * trip's first day — items are mostly entered weeks ahead, when today is the wrong month.
 * Only a starting point: items may still be dated outside the trip (CLAUDE.md §5.7).
 */
export function defaultItemDate(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  now: Date = new Date(),
): string {
  const today = deviceToday(now);
  return trip.startDate <= today && today <= trip.endDate ? today : trip.startDate;
}

/**
 * The way out, as cities (B6): 'Sofia → Helsinki → Rovaniemi'. Confirmed journeys in time order,
 * each one's From then To, until a city comes round again — the way back is the same cities in
 * reverse and would only repeat them. Car rentals are left out: they are a place, not a hop. Null
 * when no journey names two cities.
 */
export function outboundRoute(
  items: readonly Pick<TripItem, 'kind' | 'subkind' | 'status' | 'start' | 'details'>[],
): string | null {
  const stops = items
    .filter((item) => item.kind === 'transport' && item.subkind !== 'car')
    .filter((item) => item.status === 'confirmed' && item.start !== null)
    .map((item) => ({ at: toInstant(item.start!), route: transportDetails(item) }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .flatMap(({ route }) => [route?.from, route?.to])
    .filter((city): city is string => Boolean(city?.trim()));

  const key = (city: string) => city.trim().toLowerCase();
  const cities: string[] = [];
  for (const city of stops) {
    // A connection repeats the city it arrived in; skip it. Any other repeat is the way back.
    if (cities.length > 0 && key(cities[cities.length - 1]) === key(city)) continue;
    if (cities.some((seen) => key(seen) === key(city))) break;
    cities.push(city.trim());
  }
  return cities.length > 1 ? cities.join(' → ') : null;
}
