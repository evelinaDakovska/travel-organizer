/**
 * Travellers (C2): who is going. A profile is a name, kept at app level so the same person is
 * picked for every trip; a trip lists who goes, an item optionally who of them takes part.
 * Nothing else is asked for — no birth date, no passport, no account (FB-11).
 */

import { z } from 'zod';

import { listPhrase } from './format';

export const TRAVELLER_CLASSIFICATIONS = ['adult', 'child', 'unspecified'] as const;
export type TravellerClassification = (typeof TRAVELLER_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS: Record<TravellerClassification, string> = {
  adult: 'Adult',
  child: 'Child',
  unspecified: 'Not specified',
};

export const travellerClassificationSchema = z.enum(TRAVELLER_CLASSIFICATIONS);

export type Traveller = {
  id: string;
  name: string;
  sortOrder: number;
  classification: TravellerClassification;
};

export type TravellerRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  classification?: string | null;
};

export function parseTravellerRow(row: TravellerRow): Traveller {
  const classification =
    row.classification === 'adult' || row.classification === 'child'
      ? row.classification
      : 'unspecified';
  return { id: row.id, name: row.name, sortOrder: row.sort_order, classification };
}

export const travellerNameSchema = z
  .string()
  .trim()
  .min(1, 'Give them a name')
  .max(60, 'Keep it under 60 characters');

/**
 * A traveller as pickers show them: *Evelina (Me)* for the profile that is the person using the
 * app (2B-0), the name alone for anyone else. "Me" is a mark on a profile, never a name of its own.
 */
export function travellerLabel(traveller: Pick<Traveller, 'id' | 'name'>, meId: string | null): string {
  return traveller.id === meId ? `${traveller.name} (Me)` : traveller.name;
}

/** 'Evelina, Ana and Mia' — for one line on a trip or an item. Empty for nobody. */
export function namesLine(travellers: readonly Pick<Traveller, 'name'>[]): string {
  return listPhrase(travellers.map((traveller) => traveller.name));
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export type LegacyName = {
  name: string;
  /** A profile with exactly this name, offered — never applied — as the same person. */
  match: Traveller | null;
  /** All profiles matching this name. */
  matches: Traveller[];
};

/**
 * The names typed into a trip's old free-text Travellers field that are not yet one of its
 * travellers (FB-12) and have not yet been converted. Each can become a profile by an explicit
 * tap: the existing profile with the same name, or a new one. Nothing is matched by anything
 * looser than the whole name.
 */
export function legacyNames(
  typed: readonly string[],
  members: readonly Pick<Traveller, 'name'>[],
  profiles: readonly Traveller[],
  converted: readonly string[] = [],
): LegacyName[] {
  const seen: string[] = [];
  return typed
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .filter((name) => !converted.some((c) => sameName(c, name)))
    .filter((name) => !members.some((member) => sameName(member.name, name)))
    .filter((name) => {
      if (seen.some((other) => sameName(other, name))) return false;
      seen.push(name);
      return true;
    })
    .map((name) => {
      const matches = profiles.filter((profile) => sameName(profile.name, name));
      return {
        name,
        match: matches[0] ?? null,
        matches,
      };
    });
}

/**
 * Who a trip shows as going: its profile travellers, plus any remaining unconverted legacy
 * names typed before profiles existed, deduplicated case-insensitively (C1).
 */
export function tripPeopleLine(
  members: readonly Pick<Traveller, 'name'>[],
  typed: readonly string[],
  converted: readonly string[] = [],
): string {
  const memberNames = members.map((m) => m.name.trim()).filter((n) => n !== '');
  const seenLegacy: string[] = [];

  const remainingLegacy = typed
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .filter((name) => !converted.some((c) => sameName(c, name)))
    .filter((name) => !memberNames.some((m) => sameName(m, name)))
    .filter((name) => {
      if (seenLegacy.some((other) => sameName(other, name))) return false;
      seenLegacy.push(name);
      return true;
    });

  const allNames = [...memberNames, ...remainingLegacy].map((name) => ({ name }));
  return namesLine(allNames);
}

/**
 * Where a profile is used, as a sentence: 'Goes on Lapland and Milan, and is on 2 bookings'.
 * Null when nothing uses it, which is when it can be deleted.
 */
export function usesText(uses: { trips: readonly string[]; items: number }): string | null {
  const parts = [
    uses.trips.length > 0 ? `goes on ${listPhrase(uses.trips)}` : null,
    uses.items > 0 ? `is on ${uses.items} booking${uses.items === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const sentence = parts.join(', and ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * What tells a profile from another of the same name in a list of profiles (3B): its usual
 * classification and the trips it is on, *Child · On Lapland, Rome +1*. Undefined when the name is
 * its own — nothing extra is shown then.
 */
export function namesakeHint(
  traveller: Pick<Traveller, 'id' | 'name' | 'classification'>,
  profiles: readonly Pick<Traveller, 'id' | 'name'>[],
  tripNames: readonly string[],
): string | undefined {
  const shared = profiles.some(
    (other) => other.id !== traveller.id && sameName(other.name, traveller.name),
  );
  if (!shared) return undefined;
  const shown = tripNames.slice(0, 2).join(', ');
  const more = tripNames.length > 2 ? ` +${tripNames.length - 2}` : '';
  const trips = tripNames.length > 0 ? `On ${shown}${more}` : 'On no trips';
  return `${CLASSIFICATION_LABELS[traveller.classification]} · ${trips}`;
}
