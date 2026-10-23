/**
 * A day's stops for the day map (Phase 5, `docs/phase5-plan.md`). Derived from the items on every
 * read, like the Timeline: nothing is stored and viewing changes nothing.
 *
 * In order: where you wake up (the start base), every timed plan in timeline order — a journey as
 * its departure and its arrival, each on the day it happens — and where you sleep (the end base).
 * Equal places in a row are one stop. Plans with only a date have no known order, and plans with no
 * place cannot be a stop: both are listed apart, never guessed into the route.
 *
 * Pure: the drawing (`schematicLayout`) and the Google Maps hand-off (`dayRouteLinks`) live here too,
 * so the screen only renders.
 */

import {
  areEndpointsEqual,
  findStayForDay,
  formatEndpointQuery,
  resolveItemEndpoint,
  validateCoordinates,
  type DirectionEndpoint,
} from './directions';
import { addCalendarDays, dayKey } from './time';
import { buildTimeline, type TimelineEntry } from './timeline';
import type { TripItem } from './tripItem';

export type StopRole = 'wake' | 'sleep' | 'departure' | 'arrival' | 'check-in' | 'check-out' | 'visit';

export type StopPlan = {
  itemId: string;
  title: string;
  /** 'HH:mm' as written; null for a base or a date-only check-in or check-out. */
  time: string | null;
  role: StopRole;
  /** A saved idea, not a booking. */
  idea: boolean;
};

export type RouteStop = {
  key: string;
  /** What the stop is called: the place, or the station of a journey. */
  label: string;
  place: DirectionEndpoint;
  /** Null when the place has no coordinates: in the list and the link, not on the drawing. */
  coordinates: { latitude: number; longitude: number } | null;
  /** Usually one; several when equal places in a row are merged. */
  plans: StopPlan[];
};

export type DayRoute = {
  day: string;
  stops: RouteStop[];
  /** Plans with only a date: their order in the day is unknown. */
  someTime: { itemId: string; title: string }[];
  /** Plans the day holds that name no place at all. */
  noPlace: { itemId: string; title: string; time: string | null }[];
};

type Candidate = { place: DirectionEndpoint; plan: StopPlan };


const isStay = (item: TripItem) => item.kind === 'stay' && item.status === 'confirmed';

/** Where the stay is, as a stop, or null when it names no place. */
function stayPlace(stay: TripItem): DirectionEndpoint | null {
  return resolveItemEndpoint(stay, 'origin');
}

/** The candidates one timeline entry gives, in order: a journey within the day gives two. */
function entryCandidates(entry: TimelineEntry<TripItem>): Candidate[] | null {
  const { item, role } = entry;
  const idea = item.status === 'idea';
  const plan = (r: StopRole, time: string | null): StopPlan => ({ itemId: item.id, title: item.title, time, role: r, idea });

  if (item.kind === 'transport') {
    const out: Candidate[] = [];
    if (role !== 'end') {
      const from = resolveItemEndpoint(item, 'destination', 'start');
      if (from) out.push({ place: from, plan: plan('departure', entry.time) });
    }
    if (role !== 'start') {
      const to = resolveItemEndpoint(item, 'origin', 'end');
      // The arrival time of a journey within the day is its end, not its start.
      const time = role === 'end' ? entry.time : item.end && item.end.precision === 'time' ? item.end.local.slice(11, 16) : null;
      if (to) out.push({ place: to, plan: plan('arrival', time) });
    }
    return out.length > 0 ? out : null;
  }

  const place = resolveItemEndpoint(item, 'origin');
  if (!place) return null;
  const r: StopRole = item.kind === 'stay' ? (role === 'end' ? 'check-out' : 'check-in') : 'visit';
  return [{ place, plan: plan(r, entry.time) }];
}

/**
 * The day's stops (plan §3.1). `items` are the trip's; `day` is a local date, as the Timeline groups.
 */
export function dayRoute(items: readonly TripItem[], day: string): DayRoute {
  const entries = (buildTimeline(items).find((d) => d.day === day)?.entries ?? []).filter(
    (entry) => entry.item.kind !== 'task',
  );
  const stays = items.filter(isStay);
  const someTime: DayRoute['someTime'] = [];
  const noPlace: DayRoute['noPlace'] = [];
  const ordered: Candidate[] = [];
  const noPlaceSeen = new Set<string>();
  const markNoPlace = (item: TripItem, time: string | null) => {
    if (noPlaceSeen.has(item.id)) return;
    noPlaceSeen.add(item.id);
    noPlace.push({ itemId: item.id, title: item.title, time });
  };

  // Stays with only a date are bases, at the edges of the day; their other entries are in order.
  const datedStayEntries = new Set<string>();
  for (const entry of entries) {
    const { item } = entry;
    if (entry.moment.precision === 'date') {
      if (isStay(item)) {
        datedStayEntries.add(entry.key);
        continue;
      }
      someTime.push({ itemId: item.id, title: item.title });
      continue;
    }
    const candidates = entryCandidates(entry);
    if (candidates) ordered.push(...candidates);
    else markNoPlace(item, entry.time);
  }

  // The day starts where you woke up and ends where you sleep (review P3). A timed check-out or
  // check-in keeps its place in the order as well: waking at the hotel, a 09:00 visit and an 11:00
  // check-out is three stops, the hotel twice; when the base and its timed entry are next to each
  // other, the merge below makes them one stop. A base checked out of or into with only a date is
  // named by that, since its time is unknown.
  const timedEntry = (stay: TripItem, end: boolean) =>
    entries.some(
      (entry) => entry.item.id === stay.id && (entry.role === 'end') === end && !datedStayEntries.has(entry.key),
    );
  const base = (stay: TripItem | null, edge: 'wake' | 'sleep'): Candidate[] => {
    if (!stay) return [];
    const place = stayPlace(stay);
    if (!place) {
      markNoPlace(stay, null);
      return [];
    }
    const changesToday =
      edge === 'wake'
        ? stay.end !== null && dayKey(stay.end) === day && !timedEntry(stay, true)
        : stay.start !== null && dayKey(stay.start) === day && !timedEntry(stay, false);
    const role: StopRole = changesToday ? (edge === 'wake' ? 'check-out' : 'check-in') : edge;
    return [{ place, plan: { itemId: stay.id, title: stay.title, time: null, role, idea: false } }];
  };
  const wake = base(findStayForDay(stays, addCalendarDays(day, -1)), 'wake');
  const sleep = base(findStayForDay(stays, day), 'sleep');

  // Equal places in a row are one stop, naming every plan there.
  const stops: RouteStop[] = [];
  for (const candidate of [...wake, ...ordered, ...sleep]) {
    const last = stops[stops.length - 1];
    if (last && areEndpointsEqual(last.place, candidate.place)) {
      last.plans.push(candidate.plan);
      continue;
    }
    const { latitude, longitude } = candidate.place;
    stops.push({
      key: `${candidate.plan.itemId}:${candidate.plan.role}:${stops.length}`,
      label: candidate.place.title,
      place: candidate.place,
      coordinates: validateCoordinates(latitude, longitude) ? { latitude: latitude!, longitude: longitude! } : null,
      plans: [candidate.plan],
    });
  }

  return { day, stops, someTime, noPlace };
}

/** The days of a trip that have at least one stop or listed plan, in order. */
export function routeDays(items: readonly TripItem[], days: readonly string[]): string[] {
  return days.filter((day) => {
    const route = dayRoute(items, day);
    return route.stops.length > 0 || route.someTime.length > 0 || route.noPlace.length > 0;
  });
}

// ─── The drawing ────────────────────────────────────────────────────────────────────────────────

export type SchematicPoint = {
  /** 1-based stop numbers drawn at this point: one, or several for a place visited again. */
  numbers: number[];
  x: number;
  y: number;
};

export type SchematicLayout = {
  points: SchematicPoint[];
  /**
   * The dashed lines, each a run of indexes into `points` in stop order. A stop without coordinates
   * ends a run: the stops either side of it are not joined, because they were not consecutive
   * (review P2). A run of one point draws nothing.
   */
  segments: number[][];
};

/**
 * Stops with coordinates placed in a `width` × `height` box with `padding` around: local
 * equirectangular (longitude scaled by the cosine of the mean latitude, so shapes keep their
 * proportions), north up, fitted without stretching. A span over the 180th meridian is unwrapped.
 * One place, or all at one place, sits in the middle. Not a map: no scale, no roads.
 */
export function schematicLayout(stops: readonly RouteStop[], width: number, height: number, padding: number): SchematicLayout {
  const placed = stops
    .map((stop, index) => ({ stop, number: index + 1 }))
    .filter((entry) => entry.stop.coordinates !== null);
  if (placed.length === 0) return { points: [], segments: [] };

  const lngs = placed.map(({ stop }) => stop.coordinates!.longitude);
  const unwrap = Math.max(...lngs) - Math.min(...lngs) > 180;
  const lngOf = (lng: number) => (unwrap && lng < 0 ? lng + 360 : lng);

  const points: SchematicPoint[] = [];
  const keyToPoint = new Map<string, number>();
  const segments: number[][] = [];
  let run: number[] = [];
  const raw: { lat: number; lng: number }[] = [];
  stops.forEach((stop, i) => {
    if (stop.coordinates === null) {
      if (run.length > 1) segments.push(run);
      run = [];
      return;
    }
    const number = i + 1;
    const { latitude, longitude } = stop.coordinates;
    const key = `${latitude},${longitude}`;
    let index = keyToPoint.get(key);
    if (index === undefined) {
      index = points.length;
      keyToPoint.set(key, index);
      points.push({ numbers: [], x: 0, y: 0 });
      raw.push({ lat: latitude, lng: lngOf(longitude) });
    }
    points[index].numbers.push(number);
    if (run[run.length - 1] !== index) run.push(index);
  });
  if (run.length > 1) segments.push(run);

  const meanLat = raw.reduce((sum, p) => sum + p.lat, 0) / raw.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xs = raw.map((p) => p.lng * k);
  const ys = raw.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX ? innerW / spanX : Infinity, spanY ? innerH / spanY : Infinity);
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;
  raw.forEach((_, i) => {
    points[i].x = offsetX + (xs[i] - minX) * scale;
    points[i].y = offsetY + (maxY - ys[i]) * scale;
  });
  return { points, segments };
}

// ─── The hand-off ───────────────────────────────────────────────────────────────────────────────

export type RouteMode = 'driving' | 'walking' | null;

export type RouteLink = {
  /** 1-based stop numbers the part runs from and to. */
  from: number;
  to: number;
  /** Null when the link would be too long for Google Maps (2 048 characters). */
  url: string | null;
};

/** Origin, three waypoints, destination: what a mobile browser accepts too (plan §3.4). */
export const STOPS_PER_LINK = 5;
const MAX_URL = 2048;

/**
 * Google Maps directions through the day's stops, in parts of at most `STOPS_PER_LINK` that share
 * their joining stop. One stop is a place search; none is nothing. Transit is not a mode here:
 * Google Maps does not route transit through stops (plan P5-6).
 */
export function dayRouteLinks(stops: readonly RouteStop[], mode: RouteMode = null): RouteLink[] {
  const queries = stops.map((stop) => formatEndpointQuery(stop.place));
  if (stops.length === 0) return [];
  if (stops.length === 1) {
    const query = queries[0];
    const url = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
    return [{ from: 1, to: 1, url: url && url.length <= MAX_URL ? url : null }];
  }

  const links: RouteLink[] = [];
  for (let start = 0; start < stops.length - 1; start += STOPS_PER_LINK - 1) {
    const end = Math.min(start + STOPS_PER_LINK - 1, stops.length - 1);
    const part = queries.slice(start, end + 1);
    let url: string | null = null;
    if (part.every((query) => query)) {
      const params = new URLSearchParams({ api: '1', origin: part[0]!, destination: part[part.length - 1]! });
      if (part.length > 2) params.set('waypoints', part.slice(1, -1).join('|'));
      if (mode) params.set('travelmode', mode);
      url = `https://www.google.com/maps/dir/?${params.toString()}`;
      if (url.length > MAX_URL) url = null;
    }
    links.push({ from: start + 1, to: end + 1, url });
  }
  return links;
}

/** 'Wake up', 'Departure'…: what a plan is at its stop, for the list. */
export function stopRoleText(role: StopRole): string | null {
  switch (role) {
    case 'wake':
      return 'Wake up here';
    case 'sleep':
      return 'Night here';
    case 'departure':
      return 'Departure';
    case 'arrival':
      return 'Arrival';
    case 'check-in':
      return 'Check in';
    case 'check-out':
      return 'Check out';
    case 'visit':
      return null;
  }
}
