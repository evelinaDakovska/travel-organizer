/**
 * Structural types for TripItems. The Zod schema, row parser and repository land in C2;
 * these are the enums and the shape the whole model turns on.
 */

import { z } from 'zod';

import { localPrecision, toInstant, type LocalMoment, type TimePrecision } from './time';
import { isResolvableTimezone } from './timezones';

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

/**
 * Which icon an item shows (F1): its subkind when that is valid for its kind, its kind otherwise —
 * so an item moved to another kind never keeps a stale subkind's icon.
 */
export function itemIconKey(kind: TripItemKind, subkind: string | null): TripItemKind | Subkind {
  return subkind !== null && isValidSubkind(kind, subkind) ? (subkind as Subkind) : kind;
}

/** Subkind is always optional — 'other' is expressed as no subkind, not a value. */
export function isValidSubkind(kind: TripItemKind, subkind: string | null): boolean {
  if (subkind === null) return true;
  return (SUBKINDS[kind] as readonly string[]).includes(subkind);
}

const KIND_LABELS: Record<TripItemKind, string> = {
  transport: 'Travel',
  stay: 'Stay',
  activity: 'Activity',
  food: 'Food',
  task: 'To do',
  other: 'Other',
};

export function kindLabel(kind: TripItemKind): string {
  return KIND_LABELS[kind];
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
  /** The zone the row states for itself, null when it follows the trip. Editing must preserve this. */
  startTzOverride: string | null;
  endTzOverride: string | null;
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

/** The flat shape of a trip_items row. `*_utc` are derived caches — never read them as truth. */
export type TripItemRow = {
  id: string;
  trip_id: string;
  kind: string;
  subkind: string | null;
  status: string;
  priority: string | null;
  title: string;
  start_local: string | null;
  start_tz: string | null;
  start_precision: string | null;
  start_utc: string | null;
  end_local: string | null;
  end_tz: string | null;
  end_precision: string | null;
  end_utc: string | null;
  completed_at: string | null;
  location_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  confirmation_code: string | null;
  notes: string | null;
  details: string | null;
  price_amount: number | null;
  price_currency: string | null;
  is_paid: number;
  created_at: string;
  updated_at: string;
};

/**
 * Transport is the one kind with a structural need a column cannot meet: it has two
 * endpoints, not one location. Everything else is served by title, location and notes.
 */
export const transportDetailsSchema = z.object({
  from: z.string().trim().max(80).optional(),
  to: z.string().trim().max(80).optional(),
  carrier: z.string().trim().max(60).optional(),
  number: z.string().trim().max(24).optional(),
  seat: z.string().trim().max(24).optional(),
  /** Shared by the legs of one journey entered together (U7). */
  journeyId: z.string().max(64).optional(),
});

export type TransportDetails = z.infer<typeof transportDetailsSchema>;

/**
 * Details that survive a change of kind: the route belongs to transport only; everything else —
 * the reminder choice, refundable — belongs to any item. Undefined when nothing is left.
 */
export function detailsForKind(
  details: Record<string, unknown> | null | undefined,
  kind: TripItemKind,
): Record<string, unknown> | undefined {
  const kept = Object.fromEntries(
    Object.entries(details ?? {}).filter(
      ([key]) => kind === 'transport' || !(key in transportDetailsSchema.shape),
    ),
  );
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** Unknown kinds stay permissive so a backup from a later version is not rejected on read. */
export function detailsSchemaFor(kind: TripItemKind) {
  return kind === 'transport' ? transportDetailsSchema : z.record(z.string(), z.unknown());
}

/** Typed details for a transport item, or null for anything else. */
export function transportDetails(item: {
  kind: TripItemKind;
  details: Record<string, unknown> | null;
}): TransportDetails | null {
  if (item.kind !== 'transport' || item.details === null) return null;
  const parsed = transportDetailsSchema.safeParse(item.details);
  return parsed.success ? parsed.data : null;
}

/** 'Sofia → Bergamo', or just whichever end is known. Null when neither is. */
export function routeLabel(details: TransportDetails | null): string | null {
  if (!details) return null;
  const { from, to } = details;
  if (from && to) return `${from} → ${to}`;
  if (to) return `→ ${to}`;
  return from ?? null;
}

/** A moment as a form supplies it. `tz` absent means "whatever the trip's default is". */
const momentInputSchema = z.object({
  local: z.string().refine((v) => localPrecision(v) !== null, 'Use YYYY-MM-DD or YYYY-MM-DDTHH:mm'),
  tz: z.string().refine(isResolvableTimezone, 'Not a valid timezone').optional(),
});

export type MomentInput = z.infer<typeof momentInputSchema>;

/**
 * Built per trip because validating that an end follows its start needs the zone an
 * unqualified moment falls back to.
 */
export function tripItemInputSchema(defaultTz: string) {
  return z
    .object({
      kind: z.enum(TRIP_ITEM_KINDS),
      subkind: z.string().nullish(),
      status: z.enum(TRIP_ITEM_STATUSES).default('idea'),
      priority: z.enum(PRIORITIES).nullish(),
      title: z.string().trim().min(1, 'Give it a title').max(120),
      start: momentInputSchema.optional(),
      end: momentInputSchema.optional(),
      locationName: z.string().trim().max(120).optional(),
      address: z.string().trim().max(240).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      confirmationCode: z.string().trim().max(60).optional(),
      notes: z.string().trim().optional(),
      details: z.record(z.string(), z.unknown()).optional(),
      priceAmount: z.number().int().optional(),
      priceCurrency: z.string().trim().length(3).optional(),
      isPaid: z.boolean().default(false),
    })
    .refine((v) => isValidSubkind(v.kind, v.subkind ?? null), {
      message: 'That is not a type of this kind',
      path: ['subkind'],
    })
    .refine((v) => v.details === undefined || detailsSchemaFor(v.kind).safeParse(v.details).success, {
      message: 'Those details do not belong to this kind',
      path: ['details'],
    })
    .refine((v) => v.start !== undefined || v.end === undefined, {
      message: 'Add a start before an end',
      path: ['start'],
    })
    .refine((v) => !(v.start && v.end) || instantOf(v.end, defaultTz) >= instantOf(v.start, defaultTz), {
      message: 'It cannot end before it starts',
      path: ['end'],
    })
    .refine((v) => v.priceAmount === undefined || v.priceCurrency !== undefined, {
      message: 'Pick a currency',
      path: ['priceCurrency'],
    });
}

/** What the currency field starts on, for a new item and for one that has no price yet. */
export const DEFAULT_CURRENCY = 'EUR';

/** After parsing: defaults applied, so `status` and `isPaid` are always present. */
export type TripItemInput = z.output<ReturnType<typeof tripItemInputSchema>>;

/** What a form holds before parsing — defaulted fields are still optional here. */
export type TripItemFormValues = z.input<ReturnType<typeof tripItemInputSchema>>;

function momentOf(input: MomentInput, defaultTz: string): LocalMoment {
  return {
    local: input.local,
    tz: input.tz ?? defaultTz,
    precision: localPrecision(input.local)!,
  };
}

function instantOf(input: MomentInput, defaultTz: string): string {
  return toInstant(momentOf(input, defaultTz));
}

/**
 * The flat column values for a write. The only place `*_utc` is produced, so it can never
 * drift from the wall-clock text it is derived from.
 */
export function tripItemWriteValues(input: TripItemInput, defaultTz: string) {
  return {
    kind: input.kind,
    subkind: input.subkind ?? null,
    status: input.status,
    priority: input.priority ?? null,
    title: input.title,
    start_local: input.start?.local ?? null,
    start_tz: input.start?.tz ?? null,
    start_precision: input.start ? localPrecision(input.start.local) : null,
    start_utc: input.start ? instantOf(input.start, defaultTz) : null,
    end_local: input.end?.local ?? null,
    end_tz: input.end?.tz ?? null,
    end_precision: input.end ? localPrecision(input.end.local) : null,
    end_utc: input.end ? instantOf(input.end, defaultTz) : null,
    location_name: input.locationName ?? null,
    address: input.address ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    confirmation_code: input.confirmationCode ?? null,
    notes: input.notes ?? null,
    details: input.details ? JSON.stringify(input.details) : null,
    price_amount: input.priceAmount ?? null,
    // The form always holds a currency (EUR unless changed); without an amount it means nothing.
    price_currency: input.priceAmount === undefined ? null : (input.priceCurrency ?? null),
    is_paid: input.isPaid ? 1 : 0,
  };
}

function parseMoment(
  local: string | null,
  tz: string | null,
  precision: string | null,
  defaultTz: string,
): LocalMoment | null {
  if (local === null || precision === null) return null;
  return { local, tz: tz ?? defaultTz, precision: precision as TimePrecision };
}

/** `defaultTz` is the trip's, used wherever the row left a zone unqualified. */
export function parseTripItemRow(row: TripItemRow, defaultTz: string): TripItem {
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.kind as TripItemKind,
    subkind: row.subkind,
    status: row.status as TripItemStatus,
    priority: row.priority as Priority | null,
    title: row.title,
    start: parseMoment(row.start_local, row.start_tz, row.start_precision, defaultTz),
    end: parseMoment(row.end_local, row.end_tz, row.end_precision, defaultTz),
    startTzOverride: row.start_tz,
    endTzOverride: row.end_tz,
    completedAt: row.completed_at,
    locationName: row.location_name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    confirmationCode: row.confirmation_code,
    notes: row.notes,
    details: parseDetails(row.details),
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    isPaid: row.is_paid === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Tolerates malformed JSON rather than breaking the whole item list. */
function parseDetails(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Column values as the `$camelCase` parameters the insert and update statements bind. */
export function tripItemBindings(input: TripItemInput, defaultTz: string) {
  const v = tripItemWriteValues(input, defaultTz);
  return {
    $kind: v.kind,
    $subkind: v.subkind,
    $status: v.status,
    $priority: v.priority,
    $title: v.title,
    $startLocal: v.start_local,
    $startTz: v.start_tz,
    $startPrecision: v.start_precision,
    $startUtc: v.start_utc,
    $endLocal: v.end_local,
    $endTz: v.end_tz,
    $endPrecision: v.end_precision,
    $endUtc: v.end_utc,
    $locationName: v.location_name,
    $address: v.address,
    $latitude: v.latitude,
    $longitude: v.longitude,
    $confirmationCode: v.confirmation_code,
    $notes: v.notes,
    $details: v.details,
    $priceAmount: v.price_amount,
    $priceCurrency: v.price_currency,
    $isPaid: v.is_paid,
  };
}

/**
 * Turns a stored item back into what the form holds. Uses the zone OVERRIDE rather than the
 * resolved one, or editing would pin an item that was meant to follow the trip.
 */
export function tripItemFormValues(item: TripItem): TripItemFormValues {
  const moment = (at: LocalMoment | null, override: string | null) =>
    at ? { local: at.local, ...(override ? { tz: override } : {}) } : undefined;

  return {
    kind: item.kind,
    subkind: item.subkind,
    status: item.status,
    priority: item.priority,
    title: item.title,
    start: moment(item.start, item.startTzOverride),
    end: moment(item.end, item.endTzOverride),
    locationName: item.locationName ?? undefined,
    address: item.address ?? undefined,
    latitude: item.latitude ?? undefined,
    longitude: item.longitude ?? undefined,
    confirmationCode: item.confirmationCode ?? undefined,
    notes: item.notes ?? undefined,
    details: item.details ?? undefined,
    priceAmount: item.priceAmount ?? undefined,
    priceCurrency: item.priceCurrency ?? DEFAULT_CURRENCY,
    isPaid: item.isPaid,
  };
}

/**
 * Keeps an end from falling before its start when the start moves: an end on an earlier day
 * moves to the start's day, keeping its own time and zone. Undefined stays undefined — an end
 * is optional and is never invented here.
 */
export function followStart(
  start: MomentInput | undefined,
  end: MomentInput | undefined,
): MomentInput | undefined {
  if (!start || !end) return end;
  const startDay = start.local.slice(0, 10);
  if (end.local.slice(0, 10) >= startDay) return end;
  return { ...end, local: startDay + end.local.slice(10) };
}
