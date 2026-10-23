/**
 * A trip's plans as an iCalendar file (RFC 5545) for calendar apps to import (Phase 8,
 * `docs/phase8-plan.md`). A one-time copy, not a sync. Nothing is invented: no duration for a plan
 * without an end, no time for a date-only plan. Times keep their own zones, each with a VTIMEZONE
 * computed from the tz database for the years the events span.
 */

import { tzOffset } from '@date-fns/tz';

import { entryRoleLabel } from './itinerary';
import { addCalendarDays, dayKey, toInstant, type LocalMoment } from './time';
import { timelineEntries, type EntryRole } from './timeline';
import { routeLabel, transportDetails, type TripItem } from './tripItem';

/** What may go in beyond the title, the journey route and the times (P8-6). */
export type IcsOptions = {
  /** The place name and address (LOCATION) and coordinates (GEO). On by default. */
  places: boolean;
  notes: boolean;
  references: boolean;
  /** Who is going, by name. */
  people: boolean;
  links: boolean;
};

export const DEFAULT_ICS_OPTIONS: IcsOptions = {
  places: true,
  notes: false,
  references: false,
  people: false,
  links: false,
};

export type CalendarEvent = {
  uid: string;
  sequence: number;
  summary: string;
  start: LocalMoment;
  /** Null: no end was written, so none is invented. */
  end: LocalMoment | null;
  location: string | null;
  geo: { latitude: number; longitude: number } | null;
  description: string | null;
  lastModified: string;
};

/** What the export reads per item besides the item itself: its people's names and its links. */
export type IcsExtras = {
  people?: ReadonlyMap<string, readonly string[]>;
  links?: ReadonlyMap<string, readonly string[]>;
};

/** Plans a calendar can hold (P8-2): dated, not cancelled, not a to-do. */
export function isCalendarItem(item: Pick<TripItem, 'kind' | 'status' | 'start'>): boolean {
  return item.kind !== 'task' && item.status !== 'cancelled' && item.start !== null;
}

/** Stays and car rentals are a check-in and a check-out, as on the Timeline (P8-3). */
function splitsIntoEnds(item: Pick<TripItem, 'kind' | 'subkind'>): boolean {
  return item.kind === 'stay' || (item.kind === 'transport' && item.subkind === 'car');
}

const SEQUENCE_EPOCH = Date.UTC(2020, 0, 1);

/** Grows with every edit, so an app that matches UIDs takes the newer copy (P8-5). */
function sequenceOf(updatedAt: string): number {
  const at = Date.parse(updatedAt);
  return Number.isFinite(at) ? Math.max(0, Math.floor((at - SEQUENCE_EPOCH) / 60_000)) : 0;
}

function eventFor(
  item: TripItem,
  role: EntryRole | 'span',
  options: IcsOptions,
  extras: IcsExtras,
): CalendarEvent {
  const prefix = role === 'start' || role === 'end' ? entryRoleLabel({ role, item }) : null;
  const route = item.kind === 'transport' ? routeLabel(transportDetails(item)) : null;
  const place = [item.locationName, item.address].filter((part): part is string => Boolean(part?.trim()));
  const location = route ?? (options.places && place.length > 0 ? place.join(', ') : null);
  const geo =
    options.places && item.latitude !== null && item.longitude !== null
      ? { latitude: item.latitude, longitude: item.longitude }
      : null;

  const people = options.people ? (extras.people?.get(item.id) ?? []) : [];
  const links = options.links ? (extras.links?.get(item.id) ?? []) : [];
  const description = [
    options.references && item.confirmationCode ? `Booking reference: ${item.confirmationCode}` : null,
    people.length > 0 ? `Who: ${people.join(', ')}` : null,
    options.notes && item.notes?.trim() ? item.notes.trim() : null,
    ...links,
  ].filter((line): line is string => line !== null);

  const moment = role === 'end' ? item.end! : item.start!;
  return {
    uid: `${item.id}${role === 'start' || role === 'end' ? `-${role}` : ''}@travel-organizer.app`,
    sequence: sequenceOf(item.updatedAt),
    summary: prefix ? `${prefix} · ${item.title}` : item.title,
    start: moment,
    end: role === 'span' ? item.end : null,
    location,
    geo,
    description: description.length > 0 ? description.join('\n') : null,
    lastModified: item.updatedAt,
  };
}

/**
 * The events for the chosen items, in time order. A stay or a car rental over more than one day is
 * two events; anything else is one event from its start to its end (an overnight flight keeps both
 * zones). Items a calendar cannot hold are skipped.
 */
export function calendarEvents(
  items: readonly TripItem[],
  options: IcsOptions = DEFAULT_ICS_OPTIONS,
  extras: IcsExtras = {},
): CalendarEvent[] {
  const chosen = items.filter(isCalendarItem);
  const split = chosen.filter(splitsIntoEnds);
  const events: { at: string; event: CalendarEvent }[] = [];
  for (const entry of timelineEntries(split)) {
    const role = entry.role === 'full' ? 'span' : entry.role;
    events.push({ at: entry.instant, event: eventFor(entry.item, role, options, extras) });
  }
  for (const item of chosen.filter((item) => !splitsIntoEnds(item))) {
    events.push({ at: toInstant(item.start!), event: eventFor(item, 'span', options, extras) });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || a.event.uid.localeCompare(b.event.uid)).map((e) => e.event);
}

// ─── RFC 5545 text ───────────────────────────────────────────────────────────────────────────────

/** TEXT values: backslash, semicolon, comma and line breaks escaped (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * One content line folded at 75 octets (§3.1): continuation lines start with a space, and a
 * multi-byte character is never split between lines.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 'YYYYMMDDTHHMMSSZ' for an instant. */
function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** 'YYYYMMDD' or 'YYYYMMDDTHHMM00' from a stored local value — the wall clock, unconverted. */
function localStamp(local: string): string {
  const compact = local.replace(/-/g, '').replace(':', '');
  return compact.length === 8 ? compact : `${compact}00`;
}

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(Math.round(minutes));
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** The zone's offset changes between two instants, each to the minute (P8-4). */
export function offsetTransitions(
  zone: string,
  fromMs: number,
  toMs: number,
): { at: number; from: number; to: number }[] {
  const STEP = 3 * 3_600_000;
  const offset = (ms: number) => tzOffset(zone, new Date(ms));
  const found: { at: number; from: number; to: number }[] = [];
  let previous = offset(fromMs);
  for (let t = fromMs + STEP; t <= toMs + STEP; t += STEP) {
    const now = offset(t);
    if (now === previous) continue;
    let lo = t - STEP;
    let hi = t;
    while (hi - lo > 60_000) {
      const mid = Math.floor((lo + hi) / 2);
      if (offset(mid) === previous) lo = mid;
      else hi = mid;
    }
    const at = Math.floor(hi / 60_000) * 60_000;
    if (at <= toMs) found.push({ at, from: previous, to: now });
    previous = now;
  }
  return found;
}

/**
 * A VTIMEZONE for `zone` from `fromMs` to `toMs`: the offset at the start, then every change as its
 * own observance with an exact local DTSTART (no RRULE), so DST rules, half-hour zones and rule
 * changes are what the tz database says (§3.6.5).
 */
export function vtimezone(zone: string, fromMs: number, toMs: number): string[] {
  const first = tzOffset(zone, new Date(fromMs));
  const changes = offsetTransitions(zone, fromMs, toMs);
  const lowest = Math.min(first, ...changes.map((c) => c.to));
  const observance = (kind: 'STANDARD' | 'DAYLIGHT', atMs: number, from: number, to: number) => [
    `BEGIN:${kind}`,
    // Local time in the offset in force before the change, as §3.6.5 counts it.
    `DTSTART:${utcStamp(atMs + from * 60_000).slice(0, 15)}`,
    `TZOFFSETFROM:${offsetText(from)}`,
    `TZOFFSETTO:${offsetText(to)}`,
    `END:${kind}`,
  ];
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${zone}`,
    ...observance(first > lowest ? 'DAYLIGHT' : 'STANDARD', fromMs, first, first),
    ...changes.flatMap((c) => observance(c.to > c.from ? 'DAYLIGHT' : 'STANDARD', c.at, c.from, c.to)),
    'END:VTIMEZONE',
  ];
}

function dateValue(name: string, moment: LocalMoment, exclusiveEnd = false): string {
  if (moment.precision === 'date') {
    const day = exclusiveEnd ? addCalendarDays(moment.local, 1) : moment.local;
    return `${name};VALUE=DATE:${localStamp(day)}`;
  }
  return `${name};TZID=${moment.tz}:${localStamp(moment.local)}`;
}

function eventLines(event: CalendarEvent, stamp: string): string[] {
  const { start, end } = event;
  // DTEND takes DTSTART's value type (§3.6.1): a date-only plan ends the day after its last day;
  // a timed plan with a date-only end keeps no end rather than inventing a time.
  let endLine: string | null = null;
  if (end && start.precision === 'date') {
    endLine = dateValue('DTEND', { ...end, local: dayKey(end), precision: 'date' }, true);
  } else if (end && end.precision === 'time') {
    endLine = dateValue('DTEND', end);
  } else if (!end && start.precision === 'date') {
    endLine = dateValue('DTEND', start, true);
  }
  const modified = Date.parse(event.lastModified);
  return [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${event.sequence}`,
    ...(Number.isFinite(modified) ? [`LAST-MODIFIED:${utcStamp(modified)}`] : []),
    dateValue('DTSTART', start),
    ...(endLine ? [endLine] : []),
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.geo ? [`GEO:${event.geo.latitude};${event.geo.longitude}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];
}

/** The year range the zones must cover: the events' years, one either side. */
function zoneRange(events: readonly CalendarEvent[]): [number, number] {
  const years = events.flatMap((e) => [e.start, e.end].filter((m): m is LocalMoment => m !== null)).map((m) => Number(m.local.slice(0, 4)));
  const low = Math.min(...years) - 1;
  const high = Math.max(...years) + 1;
  return [Date.UTC(low, 0, 1), Date.UTC(high + 1, 0, 1)];
}

/** The whole file: UTF-8 text with CRLF line endings, folded. */
export function buildIcs(events: readonly CalendarEvent[], calendarName: string, now: Date = new Date()): string {
  const zones = [
    ...new Set(
      events.flatMap((e) => [e.start, e.end]).filter((m): m is LocalMoment => m !== null && m.precision === 'time').map((m) => m.tz),
    ),
  ].sort();
  const [fromMs, toMs] = events.length > 0 ? zoneRange(events) : [0, 0];
  const stamp = utcStamp(now.getTime());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Travel Organizer//Trip calendar export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...zones.flatMap((zone) => vtimezone(zone, fromMs, toMs)),
    ...events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** 'Lapland-2026-calendar.ics' — a safe name for the share sheet. */
export function icsFileName(tripName: string): string {
  const safe =
    tripName
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'trip';
  return `${safe}-calendar.ics`;
}
