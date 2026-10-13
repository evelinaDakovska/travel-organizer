/**
 * Travellers (C2): who is going. A profile is a name, kept at app level so the same person is
 * picked for every trip; a trip lists who goes, an item optionally who of them takes part.
 * Nothing else is asked for — no birth date, no passport, no account (FB-11).
 */

import { z } from 'zod';

import { listPhrase } from './format';

export type Traveller = { id: string; name: string; sortOrder: number };

export type TravellerRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function parseTravellerRow(row: TravellerRow): Traveller {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export const travellerNameSchema = z
  .string()
  .trim()
  .min(1, 'Give them a name')
  .max(60, 'Keep it under 60 characters');

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
};

/**
 * The names typed into a trip's old free-text Travellers field that are not yet one of its
 * travellers (FB-12). Each can become a profile by an explicit tap: the existing profile with the
 * same name, or a new one. Nothing is matched by anything looser than the whole name.
 */
export function legacyNames(
  typed: readonly string[],
  members: readonly Pick<Traveller, 'name'>[],
  profiles: readonly Traveller[],
): LegacyName[] {
  const seen: string[] = [];
  return typed
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .filter((name) => !members.some((member) => sameName(member.name, name)))
    .filter((name) => {
      if (seen.some((other) => sameName(other, name))) return false;
      seen.push(name);
      return true;
    })
    .map((name) => ({
      name,
      match: profiles.find((profile) => sameName(profile.name, name)) ?? null,
    }));
}

/**
 * Who a trip shows as going: its travellers when it has any, else the names typed before profiles
 * existed, so a trip from 0.5.1 reads as it did.
 */
export function tripPeopleLine(
  members: readonly Pick<Traveller, 'name'>[],
  typed: readonly string[],
): string {
  return members.length > 0 ? namesLine(members) : namesLine(typed.map((name) => ({ name })));
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
