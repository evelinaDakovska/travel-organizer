/**
 * Possible duplicates among imported activities (2C): against what the trip already holds, and
 * against earlier entries in the same file. Conservative on purpose — a false "duplicate" hides
 * a real plan behind an unticked box — and every match says why, so the person decides.
 *
 * Two rules, nothing else:
 * 1. the same title, at a compatible time (same day — and same start time when both have one —
 *    or one or both undated), at places that do not contradict each other;
 * 2. the same place, on the same day, at the same start time, whatever the titles.
 */

import { formatShortDate } from './format';
import type { TripItem, TripItemInput, TripItemStatus } from './tripItem';

/** What the rules look at, from a stored item or from an imported input alike. */
export type DuplicateFacts = {
  title: string;
  status: TripItemStatus;
  /** 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm', null when undated. */
  start: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type DuplicateMatch = {
  /** `existing` names a trip item; `file` an earlier entry in the same file (by index). */
  source: 'existing' | 'file';
  otherTitle: string;
  reason: string;
};

/** Close enough to be the same place. */
export const SAME_PLACE_METRES = 100;
/** Far enough apart that the same title must be two different things. */
export const DIFFERENT_PLACE_METRES = 1000;

/** 'Café  de Flore!' and 'cafe de flore' are the same title; 'Duomo' and 'Duomo tour' are not. */
export function normaliseTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function factsOfItem(item: TripItem): DuplicateFacts {
  return {
    title: item.title,
    status: item.status,
    start: item.start?.local ?? null,
    locationName: item.locationName,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

export function factsOfInput(input: TripItemInput): DuplicateFacts {
  return {
    title: input.title,
    status: input.status,
    start: input.start?.local ?? null,
    locationName: input.locationName ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  };
}

function metresBetween(a: DuplicateFacts, b: DuplicateFacts): number | null {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) {
    return null;
  }
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Same named place, or within 100 m. */
function samePlace(a: DuplicateFacts, b: DuplicateFacts): boolean {
  const distance = metresBetween(a, b);
  if (distance !== null) return distance <= SAME_PLACE_METRES;
  const nameA = a.locationName ? normaliseTitle(a.locationName) : '';
  const nameB = b.locationName ? normaliseTitle(b.locationName) : '';
  return nameA !== '' && nameA === nameB;
}

/** Both say where, and it is clearly not the same place. Unknown never contradicts. */
function placesContradict(a: DuplicateFacts, b: DuplicateFacts): boolean {
  const distance = metresBetween(a, b);
  if (distance !== null) return distance > DIFFERENT_PLACE_METRES;
  const nameA = a.locationName ? normaliseTitle(a.locationName) : '';
  const nameB = b.locationName ? normaliseTitle(b.locationName) : '';
  return nameA !== '' && nameB !== '' && nameA !== nameB;
}

const dayOf = (start: string) => start.slice(0, 10);
const timeOf = (start: string) => (start.length > 10 ? start.slice(11, 16) : null);

/** Same title: a different day, or a different time on the same day, is a different plan. */
function timesCompatible(a: DuplicateFacts, b: DuplicateFacts): boolean {
  if (a.start === null || b.start === null) return true;
  if (dayOf(a.start) !== dayOf(b.start)) return false;
  const timeA = timeOf(a.start);
  const timeB = timeOf(b.start);
  return timeA === null || timeB === null || timeA === timeB;
}

function whenText(facts: DuplicateFacts): string {
  if (facts.start === null) return 'no date';
  const time = timeOf(facts.start);
  return `${formatShortDate(dayOf(facts.start))}${time ? `, ${time}` : ''}`;
}

type Rule = 'title' | 'place';

/** Which rule makes `candidate` possibly `other` again, or null when neither does. */
export function duplicateRule(candidate: DuplicateFacts, other: DuplicateFacts): Rule | null {
  const title = normaliseTitle(candidate.title);
  if (title !== '' && title === normaliseTitle(other.title)) {
    return timesCompatible(candidate, other) && !placesContradict(candidate, other) ? 'title' : null;
  }
  const timed = candidate.start !== null && timeOf(candidate.start) !== null;
  return timed && candidate.start === other.start && samePlace(candidate, other) ? 'place' : null;
}

function reasonText(rule: Rule, other: DuplicateFacts, where: string | null): string {
  const what = rule === 'title' ? 'Same title as' : 'Same place and time as';
  const facts = [whenText(other), other.status === 'cancelled' ? 'cancelled' : null, where];
  return `${what} “${other.title}” (${facts.filter(Boolean).join(', ')})`;
}

/**
 * For each candidate (null where invalid), its first match: an item already in the trip, else an
 * earlier valid entry in the file. The first of two repeats in a file is not itself a duplicate.
 */
export function findActivityDuplicates(
  candidates: readonly (DuplicateFacts | null)[],
  existing: readonly DuplicateFacts[],
): (DuplicateMatch | null)[] {
  return candidates.map((candidate, index) => {
    if (candidate === null) return null;
    for (const item of existing) {
      const rule = duplicateRule(candidate, item);
      if (rule) return { source: 'existing', otherTitle: item.title, reason: reasonText(rule, item, null) };
    }
    for (let earlier = 0; earlier < index; earlier++) {
      const other = candidates[earlier];
      if (other === null) continue;
      const rule = duplicateRule(candidate, other);
      if (rule) {
        return {
          source: 'file',
          otherTitle: other.title,
          reason: reasonText(rule, other, `entry ${earlier + 1} in this file`),
        };
      }
    }
    return null;
  });
}
