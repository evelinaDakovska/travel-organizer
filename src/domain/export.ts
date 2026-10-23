/**
 * The backup format. Rows are exported RAW rather than as domain objects, so a restore
 * reproduces the database exactly and survives refactors of the domain layer.
 */

import { z } from 'zod';

import { isStoredPath, missingFiles } from './resource';
import { travellerClassificationSchema } from './traveller';

/**
 * 2 added expenses, payments and `resources.expense_id` (N5); 3 added travellers, lists and
 * templates (Fieldbook, migration 003); 4 added traveller classification (migration 004); 5 added
 * converted_travellers (migration 005); 6 added list_item_recipients (migration 006, 2B-0); 7 has
 * the same tables and columns, but price lines in `trip_items.details` may carry who they are for,
 * group prices and extras (3C) — raised so an older app refuses the file rather than dropping
 * those on its next edit; 8 added booking_payments and `expenses.trip_item_id` / `payer_id`
 * (migration 007, 3D-1); 9 added cost_shares and trip_cover (migration 008, 3D-2); 10 added
 * settlements (migration 009, 3E); 11 added unsplit_confirmations (migration 010, review P1); 12
 * added settlement_reviews (migration 011, §15); 13 added trip_rates, `trips.report_currency` and
 * charged amounts on expenses and booking payments (migration 012, Phase 4). Formats 1–12
 * still import: their missing tables or columns default safely, and a format-5-or-earlier list item's one `traveller_id` becomes its one recipient
 * (`upgradeDocument`).
 */
export const EXPORT_FORMAT_VERSION = 13;
export const EXPORT_APP = 'travel-organizer';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const tripRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  destination: nullableString,
  start_date: z.string(),
  end_date: z.string(),
  default_tz: z.string(),
  cover_path: nullableString,
  notes: nullableString,
  traveller_count: nullableNumber,
  travellers: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
  converted_travellers: z.string().default('[]'),
  // Absent before format 13: not converted.
  report_currency: nullableString.default(null),
});

const tripItemRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  kind: z.string(),
  subkind: nullableString,
  status: z.string(),
  priority: nullableString,
  title: z.string(),
  start_local: nullableString,
  start_tz: nullableString,
  start_precision: nullableString,
  start_utc: nullableString,
  end_local: nullableString,
  end_tz: nullableString,
  end_precision: nullableString,
  end_utc: nullableString,
  completed_at: nullableString,
  location_name: nullableString,
  address: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  confirmation_code: nullableString,
  notes: nullableString,
  details: nullableString,
  price_amount: nullableNumber,
  price_currency: nullableString,
  is_paid: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const noteRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  title: z.string(),
  body: z.string(),
  pinned: z.number(),
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const resourceRowSchema = z.object({
  id: z.string().min(1),
  trip_id: nullableString,
  trip_item_id: nullableString,
  kind: z.string(),
  subtype: z.string(),
  label: z.string(),
  url: nullableString,
  stored_path: nullableString,
  file_name: nullableString,
  mime_type: nullableString,
  size_bytes: nullableNumber,
  sort_order: z.number(),
  created_at: z.string(),
  // Absent from a format-1 backup, which predates receipts.
  expense_id: nullableString.default(null),
});

const expenseRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  category: z.string(),
  label: nullableString,
  amount: z.number(),
  currency: z.string(),
  spent_on: z.string(),
  notes: nullableString,
  paid_by: nullableString,
  split: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
  // Absent before format 8: every older expense is standalone spending with no payer recorded.
  trip_item_id: nullableString.default(null),
  payer_id: nullableString.default(null),
  // Absent before format 13: nothing charged in another currency.
  charged_amount: nullableNumber.default(null),
  charged_currency: nullableString.default(null),
});

const bookingPaymentRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  trip_item_id: z.string().min(1),
  payer_id: nullableString,
  amount: z.number(),
  currency: z.string(),
  paid_on: nullableString,
  note: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
  // Absent before format 13: nothing charged in another currency.
  charged_amount: nullableNumber.default(null),
  charged_currency: nullableString.default(null),
});

const costShareRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  trip_item_id: nullableString,
  expense_id: nullableString,
  traveller_id: z.string().min(1),
  amount: nullableNumber,
  covered_by: nullableString,
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const tripCoverRowSchema = z.object({
  trip_id: z.string().min(1),
  child_id: z.string().min(1),
  adult_id: z.string().min(1),
  sort_order: z.number(),
});

const settlementRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  from_id: z.string().min(1),
  to_id: z.string().min(1),
  amount: z.number(),
  currency: z.string(),
  settled_on: nullableString,
  note: nullableString,
  created_at: z.string(),
  updated_at: z.string(),
});

const unsplitConfirmationRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  trip_item_id: nullableString,
  expense_id: nullableString,
  fingerprint: z.string(),
  confirmed_at: z.string(),
});

const settlementReviewRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  currency: z.string().min(1),
  reason: z.enum(['deleted', 'moved', 'left']),
  cost_kind: z.enum(['booking', 'expense']),
  cost_title: z.string(),
  cost_amount: z.number().int(),
  to_currency: nullableString,
  created_at: z.string(),
  acknowledged_at: nullableString,
});

const tripRateRowSchema = z.object({
  trip_id: z.string().min(1),
  currency: z.string().min(1),
  base_currency: z.string().min(1),
  rate: z.string().min(1),
  rate_date: z.string(),
  updated_at: z.string(),
});

const paymentRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  from_name: z.string(),
  to_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  created_at: z.string(),
});

const settingRowSchema = z.object({ key: z.string(), value: z.string() });

const travellerRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  classification: travellerClassificationSchema.default('unspecified'),
});

const tripTravellerRowSchema = z.object({
  trip_id: z.string().min(1),
  traveller_id: z.string().min(1),
  sort_order: z.number(),
  classification: travellerClassificationSchema.default('unspecified'),
});

const itemParticipantRowSchema = z.object({
  item_id: z.string().min(1),
  traveller_id: z.string().min(1),
});

const listRowSchema = z.object({
  id: z.string().min(1),
  trip_id: nullableString,
  kind: z.string(),
  name: z.string(),
  source_list_id: nullableString,
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const listItemRowSchema = z.object({
  id: z.string().min(1),
  list_id: z.string().min(1),
  label: z.string(),
  quantity: nullableNumber,
  unit: nullableString,
  category: nullableString,
  note: nullableString,
  traveller_id: nullableString,
  done_at: nullableString,
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const listItemRecipientRowSchema = z.object({
  list_item_id: z.string().min(1),
  traveller_id: z.string().min(1),
});

const templateRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  content: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const templateUseRowSchema = z.object({
  trip_id: z.string().min(1),
  template_id: z.string().min(1),
  applied_at: z.string(),
});

/**
 * The raw row schemas, shared with the single-trip archive (2B), which carries the same rows so it
 * needs no second definition of any table.
 */
export const ROW_SCHEMAS = {
  trips: tripRowSchema,
  tripItems: tripItemRowSchema,
  tripNotes: noteRowSchema,
  resources: resourceRowSchema,
  expenses: expenseRowSchema,
  payments: paymentRowSchema,
  bookingPayments: bookingPaymentRowSchema,
  costShares: costShareRowSchema,
  tripCover: tripCoverRowSchema,
  settlements: settlementRowSchema,
  unsplitConfirmations: unsplitConfirmationRowSchema,
  settlementReviews: settlementReviewRowSchema,
  tripRates: tripRateRowSchema,
  travellers: travellerRowSchema,
  tripTravellers: tripTravellerRowSchema,
  itemParticipants: itemParticipantRowSchema,
  lists: listRowSchema,
  listItems: listItemRowSchema,
  listItemRecipients: listItemRecipientRowSchema,
  templateUses: templateUseRowSchema,
} as const;

export type TripExportRow = z.infer<typeof tripRowSchema>;
export type TripItemExportRow = z.infer<typeof tripItemRowSchema>;
export type NoteExportRow = z.infer<typeof noteRowSchema>;
export type ResourceExportRow = z.infer<typeof resourceRowSchema>;
export type SettingExportRow = z.infer<typeof settingRowSchema>;
export type ExpenseExportRow = z.infer<typeof expenseRowSchema>;
export type PaymentExportRow = z.infer<typeof paymentRowSchema>;
export type BookingPaymentExportRow = z.infer<typeof bookingPaymentRowSchema>;
export type CostShareExportRow = z.infer<typeof costShareRowSchema>;
export type TripCoverExportRow = z.infer<typeof tripCoverRowSchema>;
export type SettlementExportRow = z.infer<typeof settlementRowSchema>;
export type UnsplitConfirmationExportRow = z.infer<typeof unsplitConfirmationRowSchema>;
export type SettlementReviewExportRow = z.infer<typeof settlementReviewRowSchema>;
export type TripRateExportRow = z.infer<typeof tripRateRowSchema>;
export type TravellerExportRow = z.infer<typeof travellerRowSchema>;
export type TripTravellerExportRow = z.infer<typeof tripTravellerRowSchema>;
export type ItemParticipantExportRow = z.infer<typeof itemParticipantRowSchema>;
export type ListExportRow = z.infer<typeof listRowSchema>;
export type ListItemExportRow = z.infer<typeof listItemRowSchema>;
export type ListItemRecipientExportRow = z.infer<typeof listItemRecipientRowSchema>;
export type TemplateExportRow = z.infer<typeof templateRowSchema>;
export type TemplateUseExportRow = z.infer<typeof templateUseRowSchema>;

export type ExportTables = {
  trips: TripExportRow[];
  tripItems: TripItemExportRow[];
  tripNotes: NoteExportRow[];
  expenses: ExpenseExportRow[];
  payments: PaymentExportRow[];
  bookingPayments: BookingPaymentExportRow[];
  costShares: CostShareExportRow[];
  tripCover: TripCoverExportRow[];
  settlements: SettlementExportRow[];
  unsplitConfirmations: UnsplitConfirmationExportRow[];
  settlementReviews: SettlementReviewExportRow[];
  tripRates: TripRateExportRow[];
  resources: ResourceExportRow[];
  settings: SettingExportRow[];
  travellers: TravellerExportRow[];
  tripTravellers: TripTravellerExportRow[];
  itemParticipants: ItemParticipantExportRow[];
  lists: ListExportRow[];
  listItems: ListItemExportRow[];
  listItemRecipients: ListItemRecipientExportRow[];
  templates: TemplateExportRow[];
  templateUses: TemplateUseExportRow[];
};

/** One entry per distinct file, listing every resource that points at it. */
export type FileManifestEntry = {
  storedPath: string;
  sizeBytes: number | null;
  resourceIds: string[];
};

const fileManifestEntrySchema = z.object({
  storedPath: z.string().refine(isStoredPath, 'Not a media path'),
  sizeBytes: nullableNumber,
  resourceIds: z.array(z.string()),
});

export const exportDocumentSchema = z.object({
  formatVersion: z.number().int().positive(),
  app: z.literal(EXPORT_APP),
  exportedAt: z.string(),
  tables: z.object({
    trips: z.array(tripRowSchema),
    tripItems: z.array(tripItemRowSchema),
    tripNotes: z.array(noteRowSchema),
    // Absent from a format-1 backup.
    expenses: z.array(expenseRowSchema).default([]),
    payments: z.array(paymentRowSchema).default([]),
    resources: z.array(resourceRowSchema),
    settings: z.array(settingRowSchema),
    // Absent before format 3.
    travellers: z.array(travellerRowSchema).default([]),
    tripTravellers: z.array(tripTravellerRowSchema).default([]),
    itemParticipants: z.array(itemParticipantRowSchema).default([]),
    lists: z.array(listRowSchema).default([]),
    listItems: z.array(listItemRowSchema).default([]),
    // Absent before format 6: rebuilt from list_items.traveller_id by upgradeDocument.
    listItemRecipients: z.array(listItemRecipientRowSchema).default([]),
    templates: z.array(templateRowSchema).default([]),
    templateUses: z.array(templateUseRowSchema).default([]),
    // Absent before format 8.
    bookingPayments: z.array(bookingPaymentRowSchema).default([]),
    // Absent before format 9: nothing split, nobody covered.
    costShares: z.array(costShareRowSchema).default([]),
    tripCover: z.array(tripCoverRowSchema).default([]),
    // Absent before format 10: nobody has settled anything.
    settlements: z.array(settlementRowSchema).default([]),
    // Absent before format 11: no unsplit cost kept outside.
    unsplitConfirmations: z.array(unsplitConfirmationRowSchema).default([]),
    // Absent before format 12: nothing was held for review.
    settlementReviews: z.array(settlementReviewRowSchema).default([]),
    // Absent before format 13: no rates.
    tripRates: z.array(tripRateRowSchema).default([]),
  }),
  files: z.array(fileManifestEntrySchema),
});

export type ExportDocument = z.infer<typeof exportDocumentSchema>;

/** A backup with nothing in it: the shape to build one from. */
export function emptyExportTables(): ExportTables {
  return {
    trips: [],
    tripItems: [],
    tripNotes: [],
    expenses: [],
    payments: [],
    bookingPayments: [],
    costShares: [],
    tripCover: [],
    settlements: [],
    unsplitConfirmations: [],
    settlementReviews: [],
    tripRates: [],
    resources: [],
    settings: [],
    travellers: [],
    tripTravellers: [],
    itemParticipants: [],
    lists: [],
    listItems: [],
    listItemRecipients: [],
    templates: [],
    templateUses: [],
  };
}

export const EXPORT_TABLE_ORDER = [
  'trips',
  'tripItems',
  'tripNotes',
  'expenses',
  'payments',
  'bookingPayments',
  'costShares',
  'tripCover',
  'settlements',
  'unsplitConfirmations',
  'settlementReviews',
  'tripRates',
  'resources',
  'settings',
  'travellers',
  'tripTravellers',
  'itemParticipants',
  'lists',
  'listItems',
  'listItemRecipients',
  'templates',
  'templateUses',
] as const satisfies readonly (keyof ExportTables)[];

/** Derived from the rows, so a file can never be listed that nothing references. */
export function buildFileManifest(
  resources: readonly ResourceExportRow[],
  sizeOf: (storedPath: string) => number | null = () => null,
): FileManifestEntry[] {
  const byPath = new Map<string, string[]>();

  for (const resource of resources) {
    if (resource.kind !== 'file' || !resource.stored_path) continue;
    const ids = byPath.get(resource.stored_path);
    if (ids) ids.push(resource.id);
    else byPath.set(resource.stored_path, [resource.id]);
  }

  return [...byPath.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([storedPath, resourceIds]) => ({
      storedPath,
      sizeBytes: sizeOf(storedPath),
      resourceIds,
    }));
}

export function buildExportDocument(
  tables: ExportTables,
  options: { exportedAt: string; sizeOf?: (storedPath: string) => number | null },
): ExportDocument {
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    app: EXPORT_APP,
    exportedAt: options.exportedAt,
    tables,
    files: buildFileManifest(tables.resources, options.sizeOf),
  };
}

export type ParseResult =
  | { ok: true; document: ExportDocument }
  | { ok: false; reason: string };

/**
 * Refuses a newer format rather than importing part of it. A backup written by a later
 * version may contain columns this one would silently drop.
 */
export function parseExportDocument(value: unknown): ParseResult {
  const parsed = exportDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'Not a valid backup' };
  }
  if (parsed.data.formatVersion > EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `This backup is from a newer version (format ${parsed.data.formatVersion})`,
    };
  }
  return { ok: true, document: upgradeDocument(parsed.data) };
}

/**
 * A backup from before format 6 has one "For" per list item, in `traveller_id`; from 6 on, who an
 * item is for lives in `listItemRecipients`. The old value becomes the one recipient, exactly as
 * migration 006 does on the phone, so restoring an old backup loses no assignment.
 */
export function upgradeDocument(document: ExportDocument): ExportDocument {
  if (document.formatVersion >= 6) return document;
  const travellerIds = new Set(document.tables.travellers.map((traveller) => traveller.id));
  const listItemRecipients = document.tables.listItems.flatMap((item) =>
    item.traveller_id && travellerIds.has(item.traveller_id)
      ? [{ list_item_id: item.id, traveller_id: item.traveller_id }]
      : [],
  );
  return { ...document, tables: { ...document.tables, listItemRecipients } };
}

/**
 * Everything belonging to one trip. Same format, so a single-trip export needs no new writer. It
 * carries the travellers the trip uses, and none of the reusable lists or templates.
 */
export function filterTablesForTrip(tables: ExportTables, tripId: string): ExportTables {
  const itemIds = new Set(
    tables.tripItems.filter((item) => item.trip_id === tripId).map((item) => item.id),
  );
  const lists = tables.lists.filter((list) => list.trip_id === tripId);
  const listIds = new Set(lists.map((list) => list.id));
  const listItems = tables.listItems.filter((item) => listIds.has(item.list_id));
  const tripTravellers = tables.tripTravellers.filter((member) => member.trip_id === tripId);
  const itemParticipants = tables.itemParticipants.filter((part) => itemIds.has(part.item_id));
  const listItemIds = new Set(listItems.map((item) => item.id));
  const listItemRecipients = tables.listItemRecipients.filter((row) =>
    listItemIds.has(row.list_item_id),
  );
  const expenses = tables.expenses.filter((expense) => expense.trip_id === tripId);
  const bookingPayments = tables.bookingPayments.filter((payment) => payment.trip_id === tripId);
  const costShares = tables.costShares.filter((share) => share.trip_id === tripId);
  const tripCover = tables.tripCover.filter((cover) => cover.trip_id === tripId);
  const settlements = tables.settlements.filter((settlement) => settlement.trip_id === tripId);
  const unsplitConfirmations = tables.unsplitConfirmations.filter((row) => row.trip_id === tripId);
  const settlementReviews = tables.settlementReviews.filter((row) => row.trip_id === tripId);
  const tripRates = tables.tripRates.filter((row) => row.trip_id === tripId);
  const usedTravellers = new Set([
    ...tripTravellers.map((member) => member.traveller_id),
    ...expenses.flatMap((expense) => (expense.payer_id ? [expense.payer_id] : [])),
    ...bookingPayments.flatMap((payment) => (payment.payer_id ? [payment.payer_id] : [])),
    ...itemParticipants.map((part) => part.traveller_id),
    ...listItems.flatMap((item) => (item.traveller_id ? [item.traveller_id] : [])),
    ...listItemRecipients.map((row) => row.traveller_id),
  ]);

  return {
    trips: tables.trips.filter((trip) => trip.id === tripId),
    tripItems: tables.tripItems.filter((item) => item.trip_id === tripId),
    tripNotes: tables.tripNotes.filter((note) => note.trip_id === tripId),
    expenses,
    payments: tables.payments.filter((payment) => payment.trip_id === tripId),
    bookingPayments,
    costShares,
    tripCover,
    settlements,
    unsplitConfirmations,
    settlementReviews,
    tripRates,
    resources: tables.resources.filter(
      (resource) =>
        resource.trip_id === tripId ||
        (resource.trip_item_id !== null && itemIds.has(resource.trip_item_id)),
    ),
    settings: [],
    travellers: tables.travellers.filter((traveller) => usedTravellers.has(traveller.id)),
    tripTravellers,
    itemParticipants,
    lists,
    listItems,
    listItemRecipients,
    templates: [],
    templateUses: tables.templateUses.filter((use) => use.trip_id === tripId),
  };
}

/** Ids of the rows that belong to no trip and are on the phone already. */
export type ExistingShared = {
  travellers: Iterable<string>;
  lists: Iterable<string>;
  templates: Iterable<string>;
};

const NOTHING_SHARED: ExistingShared = { travellers: [], lists: [], templates: [] };

export type ImportMode = 'merge' | 'replace';

export type ImportPlan = {
  mode: ImportMode;
  write: ExportTables;
  skippedTripIds: string[];
  missingFiles: string[];
};

/**
 * `merge` leaves a trip that is already here untouched, so importing a backup twice is
 * harmless. `replace` overwrites it, which is what restoring after a reinstall means.
 *
 * Rows that belong to no trip — travellers, reusable lists and their items, templates — work the
 * same way: `merge` adds only those the phone lacks (`existingShared`), `replace` takes the
 * backup's for every id it has. Neither removes one the backup does not have.
 */
export function planImport(
  document: ExportDocument,
  existingTripIds: Iterable<string>,
  mode: ImportMode = 'merge',
  availableFiles: Iterable<string> = [],
  existingShared: ExistingShared = NOTHING_SHARED,
): ImportPlan {
  const existing = new Set(existingTripIds);
  const present = new Set(availableFiles);

  const skippedTripIds =
    mode === 'replace'
      ? []
      : document.tables.trips.filter((trip) => existing.has(trip.id)).map((trip) => trip.id);

  const dropped = new Set(skippedTripIds);
  const trips = document.tables.trips.filter((trip) => !dropped.has(trip.id));
  const keptTripIds = new Set(trips.map((trip) => trip.id));
  const tripItems = document.tables.tripItems.filter((item) => keptTripIds.has(item.trip_id));
  const keptItemIds = new Set(tripItems.map((item) => item.id));

  const resources = document.tables.resources.filter(
    (resource) =>
      (resource.trip_id !== null && keptTripIds.has(resource.trip_id)) ||
      (resource.trip_item_id !== null && keptItemIds.has(resource.trip_item_id)),
  );

  const needed = resources.flatMap((resource) =>
    resource.kind === 'file' && resource.stored_path !== null ? [resource.stored_path] : [],
  );

  const { tables } = document;
  const missing = (existing: Iterable<string>) => {
    const here = new Set(existing);
    return (row: { id: string }) => mode === 'replace' || !here.has(row.id);
  };
  // A reusable list has no trip; a trip's list goes where its trip goes.
  const lists = tables.lists.filter((list) =>
    list.trip_id === null ? missing(existingShared.lists)(list) : keptTripIds.has(list.trip_id),
  );
  const keptListIds = new Set(lists.map((list) => list.id));
  const listItems = tables.listItems.filter((item) => keptListIds.has(item.list_id));
  const keptListItemIds = new Set(listItems.map((item) => item.id));

  return {
    mode,
    write: {
      trips,
      tripItems,
      tripNotes: document.tables.tripNotes.filter((note) => keptTripIds.has(note.trip_id)),
      expenses: document.tables.expenses.filter((expense) => keptTripIds.has(expense.trip_id)),
      payments: document.tables.payments.filter((payment) => keptTripIds.has(payment.trip_id)),
      bookingPayments: document.tables.bookingPayments.filter((payment) =>
        keptTripIds.has(payment.trip_id),
      ),
      costShares: document.tables.costShares.filter((share) => keptTripIds.has(share.trip_id)),
      tripCover: document.tables.tripCover.filter((cover) => keptTripIds.has(cover.trip_id)),
      settlements: document.tables.settlements.filter((settlement) => keptTripIds.has(settlement.trip_id)),
      unsplitConfirmations: document.tables.unsplitConfirmations.filter((row) => keptTripIds.has(row.trip_id)),
      settlementReviews: document.tables.settlementReviews.filter((row) => keptTripIds.has(row.trip_id)),
      tripRates: document.tables.tripRates.filter((row) => keptTripIds.has(row.trip_id)),
      resources,
      settings: document.tables.settings,
      travellers: tables.travellers.filter(missing(existingShared.travellers)),
      tripTravellers: tables.tripTravellers.filter((member) => keptTripIds.has(member.trip_id)),
      itemParticipants: tables.itemParticipants.filter((part) => keptItemIds.has(part.item_id)),
      lists,
      listItems,
      // Only for items this import writes: an item already here keeps the people it has.
      listItemRecipients: tables.listItemRecipients.filter((row) =>
        keptListItemIds.has(row.list_item_id),
      ),
      templates: tables.templates.filter(missing(existingShared.templates)),
      templateUses: tables.templateUses.filter((use) => keptTripIds.has(use.trip_id)),
    },
    skippedTripIds,
    missingFiles: missingFiles(present, needed),
  };
}

/**
 * 'travel-organizer-backup-2026-10-13-0942.zip', in the phone's own time (A4): two backups made
 * on the same day no longer share a name, and the newest is the one that sorts last.
 */
export function exportFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${EXPORT_APP}-backup-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}
