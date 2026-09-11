/**
 * Structural types for TripItems. The schema, parsing and repository land in M3;
 * these are the enums the whole model turns on.
 */

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
