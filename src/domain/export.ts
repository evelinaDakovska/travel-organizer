/**
 * The backup format. Rows are exported RAW rather than as domain objects, so a restore
 * reproduces the database exactly and survives refactors of the domain layer.
 */

import { z } from 'zod';

import { isStoredPath } from './resource';

export const EXPORT_FORMAT_VERSION = 1;
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
});

const settingRowSchema = z.object({ key: z.string(), value: z.string() });

export type TripExportRow = z.infer<typeof tripRowSchema>;
export type TripItemExportRow = z.infer<typeof tripItemRowSchema>;
export type NoteExportRow = z.infer<typeof noteRowSchema>;
export type ResourceExportRow = z.infer<typeof resourceRowSchema>;
export type SettingExportRow = z.infer<typeof settingRowSchema>;

export type ExportTables = {
  trips: TripExportRow[];
  tripItems: TripItemExportRow[];
  tripNotes: NoteExportRow[];
  resources: ResourceExportRow[];
  settings: SettingExportRow[];
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
    resources: z.array(resourceRowSchema),
    settings: z.array(settingRowSchema),
  }),
  files: z.array(fileManifestEntrySchema),
});

export type ExportDocument = z.infer<typeof exportDocumentSchema>;

export const EXPORT_TABLE_ORDER = [
  'trips',
  'tripItems',
  'tripNotes',
  'resources',
  'settings',
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
  return { ok: true, document: parsed.data };
}

/** Everything belonging to one trip. Same format, so a single-trip export needs no new writer. */
export function filterTablesForTrip(tables: ExportTables, tripId: string): ExportTables {
  const itemIds = new Set(
    tables.tripItems.filter((item) => item.trip_id === tripId).map((item) => item.id),
  );

  return {
    trips: tables.trips.filter((trip) => trip.id === tripId),
    tripItems: tables.tripItems.filter((item) => item.trip_id === tripId),
    tripNotes: tables.tripNotes.filter((note) => note.trip_id === tripId),
    resources: tables.resources.filter(
      (resource) =>
        resource.trip_id === tripId ||
        (resource.trip_item_id !== null && itemIds.has(resource.trip_item_id)),
    ),
    settings: [],
  };
}

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
 */
export function planImport(
  document: ExportDocument,
  existingTripIds: Iterable<string>,
  mode: ImportMode = 'merge',
  availableFiles: Iterable<string> = [],
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

  const needed = new Set(
    resources
      .filter((resource) => resource.kind === 'file' && resource.stored_path)
      .map((resource) => resource.stored_path as string),
  );

  return {
    mode,
    write: {
      trips,
      tripItems,
      tripNotes: document.tables.tripNotes.filter((note) => keptTripIds.has(note.trip_id)),
      resources,
      settings: document.tables.settings,
    },
    skippedTripIds,
    missingFiles: [...needed].filter((path) => !present.has(path)).sort(),
  };
}

export function exportFileName(exportedAt: string): string {
  return `${EXPORT_APP}-backup-${exportedAt.slice(0, 10)}.zip`;
}
