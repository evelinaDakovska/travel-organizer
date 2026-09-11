/**
 * Structural types for TripItems. The Zod schema, row parser and repository land in C2;
 * these are the enums and the shape the whole model turns on.
 */

import type { LocalMoment } from './time';

/** What sort of thing it is. Drives behaviour and which form fields appear. */
export const TRIP_ITEM_KINDS = [
  'transport',
  'stay',
  'activity',
  'food',
  'task',
  'other',
] as const;
export type TripItemKind = (typeof TRIP_ITEM_KINDS)[number];

/** How committed you are. Drives which tab it appears in. */
export const TRIP_ITEM_STATUSES = ['idea', 'confirmed', 'cancelled'] as const;
export type TripItemStatus = (typeof TRIP_ITEM_STATUSES)[number];

/** Only meaningful on `idea` items. */
export const PRIORITIES = ['must', 'want', 'maybe'] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * Fixed per kind, not free text: it drives icons and filtering, and free text
 * fragments into cafe / café / Coffee. Also replaces the transport-mode concept.
 */
export const SUBKINDS = {
  transport: ['flight', 'train', 'bus', 'ferry', 'car', 'taxi', 'transfer', 'walk'],
  stay: ['hotel', 'apartment', 'hostel', 'guesthouse', 'camping'],
  activity: ['museum', 'gallery', 'tour', 'attraction', 'event', 'theatre', 'outdoor', 'spa'],
  food: ['restaurant', 'cafe', 'bar', 'bakery', 'market'],
  task: ['check-in', 'booking', 'document', 'packing'],
  other: ['luggage', 'insurance', 'parking', 'shopping', 'viewpoint'],
} as const satisfies Record<TripItemKind, readonly string[]>;

export type Subkind = (typeof SUBKINDS)[TripItemKind][number];

export function subkindsFor(kind: TripItemKind): readonly string[] {
  return SUBKINDS[kind];
}

/** Subkind is always optional — 'other' is expressed as no subkind, not a value. */
export function isValidSubkind(kind: TripItemKind, subkind: string | null): boolean {
  if (subkind === null) return true;
  return (SUBKINDS[kind] as readonly string[]).includes(subkind);
}

/** 'check-in' -> 'Check-in'. */
export function subkindLabel(subkind: string): string {
  return subkind.charAt(0).toUpperCase() + subkind.slice(1);
}

/** The domain shape of a trip_items row. Flat `*_local` / `*_tz` columns become moments on parse. */
export type TripItem = {
  id: string;
  tripId: string;
  kind: TripItemKind;
  subkind: string | null;
  status: TripItemStatus;
  priority: Priority | null;
  title: string;
  /** Zone already resolved against the trip default, so nothing downstream repeats that fallback. */
  start: LocalMoment | null;
  end: LocalMoment | null;
  /** Tasks only — for anything else "done" is derivable from the end instant. */
  completedAt: string | null;
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  confirmationCode: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  /** Minor units, never a float. */
  priceAmount: number | null;
  priceCurrency: string | null;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
};
