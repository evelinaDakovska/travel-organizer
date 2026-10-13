/**
 * The zone a journey's end is really in, read off the city typed in From or To (N6).
 *
 * Every time is read in the trip's zone unless it states its own. A flight leaving Munich on a
 * Helsinki trip, entered as 08:15 with no zone, was read as 08:15 Helsinki time: an hour out, with
 * the screen still showing 08:15, so nothing looked wrong. These rules let the form fill in the
 * city's zone and let the detail page point out an item saved before that.
 *
 * Exact matches only: a city has to be one the zone search already knows. A guess that is wrong
 * would be worse than the original problem, because it would look deliberate.
 */

import { toInstant, type LocalMoment } from './time';
import { TIMEZONE_PLACES, TIMEZONES, timezoneLabel } from './timezones';
import {
  transportDetails,
  tripItemFormValues,
  tripItemInputSchema,
  type TripItem,
  type TripItemInput,
  type TripItemKind,
} from './tripItem';

const normalise = (text: string) => text.trim().toLowerCase().replace(/_/g, ' ');

/**
 * Each zone's own city ('Berlin') plus every place listed for it. A place listed under more than
 * one zone (Australia, USA) is ambiguous and maps to nothing.
 */
const PLACE_INDEX: ReadonlyMap<string, string | null> = (() => {
  const index = new Map<string, string | null>();
  const add = (place: string, tz: string) => {
    const key = normalise(place);
    if (!key) return;
    const known = index.get(key);
    index.set(key, known === undefined || known === tz ? tz : null);
  };
  for (const tz of TIMEZONES) {
    if (tz.includes('/')) add(timezoneLabel(tz), tz);
    for (const place of (TIMEZONE_PLACES as Record<string, readonly string[]>)[tz]) add(place, tz);
  }
  return index;
})();

/** 'Munich' -> 'Europe/Berlin'. Null for a place we do not know, or one that spans zones. */
export function zoneForPlace(place: string | null | undefined): string | null {
  if (!place) return null;
  return PLACE_INDEX.get(normalise(place)) ?? null;
}

/**
 * Whether two zones' clocks read differently at that wall-clock time. Sofia and Helsinki keep the
 * same clock, so a Sofia departure on a Helsinki trip needs nothing. Compared on the day itself, so
 * the weeks when one zone has changed to summer time and the other has not count correctly.
 */
export function differentClock(a: string, b: string, local: string): boolean {
  if (a === b) return false;
  return (
    toInstant({ local, tz: a, precision: 'time' }) !==
    toInstant({ local, tz: b, precision: 'time' })
  );
}

/** A moment as a form holds it: the zone only when it states its own. */
export type FormMoment = { local: string; tz?: string };

const hasTime = (local: string) => local.length > 10;

/**
 * The zone a form should fill in for a time with none of its own, read off the city at that end.
 * Null when the time already has a zone, has no time of day, the city is unknown, or the city
 * keeps the trip's clock anyway.
 */
export function zoneSuggestion(
  place: string | null | undefined,
  moment: FormMoment | undefined,
  tripTz: string,
): string | null {
  if (!moment || moment.tz || !hasTime(moment.local)) return null;
  const tz = zoneForPlace(place);
  if (!tz || !differentClock(tz, tripTz, moment.local)) return null;
  return tz;
}

/**
 * What to call a time's zone where people read it (A6): the city at that end when the city is in
 * that zone — 'Munich' for Europe/Berlin — else the zone's own city. The IANA id is what is
 * stored; this is only the name.
 */
export function zoneName(tz: string, place?: string | null): string {
  return place && zoneForPlace(place) === tz ? place.trim() : timezoneLabel(tz);
}

/** The city at one end of a journey: From for its start, To for its end. Null for other kinds. */
export function routePlace(
  item: { kind?: TripItemKind; details?: Record<string, unknown> | null },
  end: 'start' | 'end',
): string | null {
  if (!item.kind || !item.details) return null;
  const route = transportDetails({ kind: item.kind, details: item.details });
  return (end === 'start' ? route?.from : route?.to) ?? null;
}

/**
 * The moment with the city's zone filled in, or the same object when there is nothing to fill —
 * so a caller can tell by identity whether anything changed.
 */
export function withSuggestedZone<M extends FormMoment>(
  place: string | null | undefined,
  moment: M | undefined,
  tripTz: string,
): M | undefined {
  const tz = zoneSuggestion(place, moment, tripTz);
  return tz && moment ? { ...moment, tz } : moment;
}

/**
 * The city to remember at one end while From or To is being typed: the new text once it is a city
 * we know, else the last one that was (A6). Half-typed text ('Rom') is never a city, so it never
 * makes a zone look chosen by hand.
 */
export function lastKnownPlace(
  previous: string | null | undefined,
  place: string | null | undefined,
): string | null {
  return zoneForPlace(place) ? place!.trim() : (previous ?? null);
}

/**
 * A moment after the city at its end changed to `place`; `previous` is the last city known there
 * (`lastKnownPlace`). Nothing is stored to say where a zone came from — it is read off the zone
 * itself (A6, FB-3):
 * - no zone yet: the city's is filled in when it keeps another clock (`withSuggestedZone`);
 * - the previous city's own zone was filled from it, so it follows a new city we know — to that
 *   city's zone, or back to the trip's when the new city keeps the trip's clock;
 * - any other zone was chosen by hand and stays;
 * - while the city is not one we know ('Munich Airport', half-typed), nothing changes.
 * Same object when nothing changes.
 *
 * A zone picked by hand that happens to be the city's own follows the city too: the two cannot be
 * told apart without storing more, and following the city is what that choice meant.
 */
export function followPlace<M extends FormMoment>(
  previous: string | null | undefined,
  place: string | null | undefined,
  moment: M | undefined,
  tripTz: string,
): M | undefined {
  if (!moment?.tz) return withSuggestedZone(place, moment, tripTz);
  const cityTz = zoneForPlace(place);
  if (!cityTz || cityTz === moment.tz || moment.tz !== zoneForPlace(previous)) return moment;

  const { tz: _filledFromCity, ...followingTrip } = moment;
  return withSuggestedZone(place, followingTrip as M, tripTz);
}

type RouteLeg = {
  from?: string;
  to?: string;
  departs?: FormMoment;
  arrives?: FormMoment;
};

/**
 * A journey leg after an edit, both ends' zones following From and To (`followPlace`) in one
 * step. Same object if nothing changed.
 */
export function withLegZones<L extends RouteLeg>(
  previous: { from?: string | null; to?: string | null },
  leg: L,
  tripTz: string,
): L {
  const departs = followPlace(previous.from, leg.from, leg.departs, tripTz);
  const arrives = followPlace(previous.to, leg.to, leg.arrives, tripTz);
  return departs === leg.departs && arrives === leg.arrives ? leg : { ...leg, departs, arrives };
}

/**
 * Why a time carries the zone it does, for the line under it: the zone came from the city and
 * differs from the trip's. Null when there is nothing to explain.
 */
export function zoneHint(
  place: string | null | undefined,
  moment: FormMoment | undefined,
  tripTz: string,
): { place: string; tz: string; tripTz: string } | null {
  if (!moment?.tz || !hasTime(moment.local) || !place) return null;
  if (zoneForPlace(place) !== moment.tz || !differentClock(moment.tz, tripTz, moment.local)) {
    return null;
  }
  return { place: place.trim(), tz: moment.tz, tripTz };
}

/** "Munich is on a different clock from Helsinki, so this time is in Munich time." */
export function zoneHintText(hint: { place: string; tripTz: string }): string {
  return (
    `${hint.place} is on a different clock from ${timezoneLabel(hint.tripTz)}, ` +
    `so this time is in ${hint.place} time.`
  );
}

/**
 * A time whose zone was chosen by hand but whose city keeps another clock (A6): the zone the city
 * would give it, offered and never applied. Null when they agree, when the time is pinned to the
 * trip's own zone (that is what *Use … time* under the hint does, on purpose), or when nothing is
 * known.
 */
export function cityZoneConflict(
  place: string | null | undefined,
  moment: FormMoment | undefined,
  tripTz: string,
): string | null {
  if (!moment?.tz || moment.tz === tripTz || !hasTime(moment.local)) return null;
  const cityTz = zoneForPlace(place);
  if (!cityTz || !differentClock(cityTz, moment.tz, moment.local)) return null;
  return cityTz;
}

export type ZoneMismatch = {
  end: 'start' | 'end';
  place: string;
  /** The zone the city keeps. */
  tz: string;
  /** The zone the time is read in now: the trip's. */
  readIn: string;
  /** How far the stored instant is out, in minutes; positive when the city is behind. */
  minutesOut: number;
};

type MismatchItem = {
  start: LocalMoment | null;
  end: LocalMoment | null;
  startTzOverride: string | null;
  endTzOverride: string | null;
};

/**
 * Times saved without a zone whose city keeps a different clock: the departure against From, the
 * arrival against To. A time that states its own zone is left alone, even if it disagrees with
 * the city: someone chose it.
 */
export function zoneMismatches(
  item: MismatchItem,
  route: { from?: string | null; to?: string | null } | null,
): ZoneMismatch[] {
  if (!route) return [];
  const found: ZoneMismatch[] = [];
  const check = (
    end: 'start' | 'end',
    moment: LocalMoment | null,
    override: string | null,
    place?: string | null,
  ) => {
    if (!moment || override || moment.precision !== 'time' || !place) return;
    const tz = zoneForPlace(place);
    if (!tz || !differentClock(tz, moment.tz, moment.local)) return;
    const asRead = Date.parse(toInstant(moment));
    const asMeant = Date.parse(toInstant({ ...moment, tz }));
    found.push({
      end,
      place: place.trim(),
      tz,
      readIn: moment.tz,
      minutesOut: Math.round((asMeant - asRead) / 60000),
    });
  };
  check('start', item.start, item.startTzOverride, route.from);
  check('end', item.end, item.endTzOverride, route.to);
  return found;
}

/** '1 hour', '2 hours', '30 minutes', '1 hour 30 minutes'. */
export function durationText(minutes: number): string {
  const m = Math.abs(minutes);
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  const parts = [
    hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : null,
    rest > 0 ? `${rest} minute${rest === 1 ? '' : 's'}` : null,
  ].filter((part) => part !== null);
  return parts.join(' ');
}

/** "Departs Munich, but this time is read in Helsinki time. Munich is an hour behind." */
export function mismatchText(mismatch: ZoneMismatch): string {
  const verb = mismatch.end === 'start' ? 'Departs' : 'Arrives in';
  const gap = Math.abs(mismatch.minutesOut) === 60 ? 'an hour' : durationText(mismatch.minutesOut);
  const direction = mismatch.minutesOut > 0 ? 'behind' : 'ahead';
  return (
    `${verb} ${mismatch.place}, but this time is read in ${timezoneLabel(mismatch.readIn)} time. ` +
    `${mismatch.place} is ${gap} ${direction}.`
  );
}

/**
 * The item as it would be saved with one end's zone set to its city's, keeping the typed time —
 * what the detail page's one-tap fix writes. Validated with the same schema as the edit form, so
 * a change that would put the arrival before the departure is refused rather than stored.
 */
export function withMomentZone(
  item: TripItem,
  end: 'start' | 'end',
  tz: string,
  tripTz: string,
): { ok: true; input: TripItemInput } | { ok: false; reason: string } {
  const values = tripItemFormValues(item);
  const moment = values[end];
  if (!moment) return { ok: false, reason: 'This item has no such time.' };
  const parsed = tripItemInputSchema(tripTz).safeParse({ ...values, [end]: { ...moment, tz } });
  if (parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, reason: parsed.error.issues[0]?.message ?? 'That would not be valid.' };
}
