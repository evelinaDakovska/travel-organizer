/**
 * The single-trip archive (2B): one trip, its records and its files, to carry to another phone or
 * keep apart from the full backup. Pure — fflate packs and reads the zip in memory and hashing is
 * passed in — so every rule below runs in node tests exactly as on the phone.
 *
 * It is not a backup and never restores anything: importing one always makes a **new** trip, with
 * new ids for every row and every file (`planTripImport`). The full backup (`export.ts`,
 * `archive.ts`) is untouched by it, and each importer refuses the other's file by name.
 *
 * Layout (docs/phase2-plan.md §4, technical reference §17):
 *
 *   manifest.json   what this is, which version, which trip, every file with size and SHA-256
 *   trip.json       the trip's rows, in the full backup's raw row shapes (`EXPORT_FORMAT_VERSION`)
 *   files/NNN.ext   each attached file once, however many records point at it
 */

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';

import { remapFingerprint } from './balances';
import {
  EXPORT_FORMAT_VERSION,
  filterTablesForTrip,
  ROW_SCHEMAS,
  type ExportTables,
  type ResourceExportRow,
} from './export';
import { MEDIA_DIR } from './resource';

export const TRIP_ARCHIVE_KIND = 'travel-organizer-trip';
/** The archive layout's own version; the rows inside follow the backup's row format. */
export const TRIP_ARCHIVE_VERSION = 1;
export const MANIFEST_NAME = 'manifest.json';
export const DATA_NAME = 'trip.json';
const BACKUP_DOCUMENT_NAME = 'backup.json';

/**
 * Checked before anything is inflated, from the sizes the zip's directory declares; fflate then
 * never inflates an entry past its declared size, so a zip bomb is refused rather than expanded.
 * A lie about a size is caught afterwards by the size and SHA-256 in the manifest.
 */
export const TRIP_ARCHIVE_LIMITS = {
  archiveBytes: 500 * 1024 * 1024,
  entries: 2000,
  entryBytes: 200 * 1024 * 1024,
  totalBytes: 600 * 1024 * 1024,
  jsonBytes: 20 * 1024 * 1024,
} as const;

export type TripArchiveLimits = { [K in keyof typeof TRIP_ARCHIVE_LIMITS]: number };

/** A file inside the archive: under `files/`, one plain name, nothing that could climb out. */
const ARCHIVE_FILE = /^files\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function isArchiveFileName(name: string): boolean {
  return ARCHIVE_FILE.test(name) && !name.includes('..');
}

const TABLE_KEYS = [
  'trips',
  'tripItems',
  'tripNotes',
  'resources',
  'expenses',
  'payments',
  'bookingPayments',
  'costShares',
  'tripCover',
  'settlements',
  'unsplitConfirmations',
  'settlementReviews',
  'tripRates',
  'tripExchangeRates',
  'travellers',
  'tripTravellers',
  'itemParticipants',
  'lists',
  'listItems',
  'listItemRecipients',
  'templateUses',
] as const;

export type TripArchiveTables = Pick<ExportTables, (typeof TABLE_KEYS)[number]>;

const tablesSchema = z.object({
  trips: z.array(ROW_SCHEMAS.trips),
  tripItems: z.array(ROW_SCHEMAS.tripItems),
  tripNotes: z.array(ROW_SCHEMAS.tripNotes),
  resources: z.array(ROW_SCHEMAS.resources),
  expenses: z.array(ROW_SCHEMAS.expenses),
  payments: z.array(ROW_SCHEMAS.payments),
  // Absent before row format 8 (3D-1).
  bookingPayments: z.array(ROW_SCHEMAS.bookingPayments).default([]),
  // Absent before row format 9 (3D-2): nothing split, nobody covered.
  costShares: z.array(ROW_SCHEMAS.costShares).default([]),
  tripCover: z.array(ROW_SCHEMAS.tripCover).default([]),
  // Absent before row format 10 (3E): nobody has settled anything.
  settlements: z.array(ROW_SCHEMAS.settlements).default([]),
  // Absent before row format 11 (review P1): no unsplit cost kept outside.
  unsplitConfirmations: z.array(ROW_SCHEMAS.unsplitConfirmations).default([]),
  // Absent before row format 12 (§15): nothing was held for review.
  settlementReviews: z.array(ROW_SCHEMAS.settlementReviews).default([]),
  // Absent before row format 13 (Phase 4): no rates.
  tripRates: z.array(ROW_SCHEMAS.tripRates).default([]),
  // Absent before row format 14 (review P1): rebuilt from tripRates on opening, as migration 013 does.
  tripExchangeRates: z.array(ROW_SCHEMAS.tripExchangeRates).default([]),
  travellers: z.array(ROW_SCHEMAS.travellers),
  tripTravellers: z.array(ROW_SCHEMAS.tripTravellers),
  itemParticipants: z.array(ROW_SCHEMAS.itemParticipants),
  lists: z.array(ROW_SCHEMAS.lists),
  listItems: z.array(ROW_SCHEMAS.listItems),
  listItemRecipients: z.array(ROW_SCHEMAS.listItemRecipients),
  templateUses: z.array(ROW_SCHEMAS.templateUses),
});

const dataSchema = z.object({ kind: z.literal(TRIP_ARCHIVE_KIND), tables: tablesSchema });
export type TripArchiveData = z.infer<typeof dataSchema>;

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'Not a SHA-256 checksum');

/**
 * `included`: the bytes are in the archive. `excluded`: left out on purpose (an export without
 * attachments). `missing`: the file was already gone from the exporting phone.
 */
export const FILE_STATUSES = ['included', 'excluded', 'missing'] as const;
export type ArchiveFileStatus = (typeof FILE_STATUSES)[number];

const fileEntrySchema = z.object({
  name: z.string().refine(isArchiveFileName, 'Unsafe file name'),
  status: z.enum(FILE_STATUSES),
  sizeBytes: z.number().int().nonnegative().nullable(),
  sha256: sha256Hex.nullable(),
  mimeType: z.string().max(200).nullable(),
});
export type ArchiveFileEntry = z.infer<typeof fileEntrySchema>;

const manifestSchema = z.object({
  kind: z.literal(TRIP_ARCHIVE_KIND),
  formatVersion: z.number().int().positive(),
  /** The backup row format the rows in trip.json follow (`EXPORT_FORMAT_VERSION`). */
  rowFormat: z.number().int().positive(),
  /** The exporting app's database version (`PRAGMA user_version`). */
  schemaVersion: z.number().int().positive(),
  app: z.object({ name: z.literal('travel-organizer'), version: z.string().max(40) }),
  /** New for every export: the same file imported twice is recognised by it. */
  exportId: z.string().min(8).max(64),
  exportedAt: z.string().max(40),
  /** The trip's id on the exporting phone. Provenance only — never written as an id. */
  sourceTripId: z.string().min(1).max(64),
  trip: z.object({
    name: z.string().max(200),
    destination: z.string().max(200).nullable(),
    startDate: z.string().max(10),
    endDate: z.string().max(10),
  }),
  attachments: z.enum(['included', 'excluded']),
  /** Anything a reader would otherwise assume is there, is not: files left out or missing. */
  partial: z.boolean(),
  data: z.object({
    name: z.literal(DATA_NAME),
    sizeBytes: z.number().int().nonnegative(),
    sha256: sha256Hex,
  }),
  files: z.array(fileEntrySchema).max(TRIP_ARCHIVE_LIMITS.entries),
});
export type TripArchiveManifest = z.infer<typeof manifestSchema>;

// ─── Export ──────────────────────────────────────────────────────────────────────────────────────

/** What the phone knows about one stored file: null when it is not on the phone any more. */
export type StoredFileFacts = { sizeBytes: number; sha256: string } | null;

export type TripArchiveBuild = {
  manifest: TripArchiveManifest;
  dataBytes: Uint8Array;
  /** archive name → the stored path its bytes are read from; only files that go in. */
  filesToPack: Map<string, string>;
  /** Labels of documents whose file was already missing, for the export screen. */
  missingLabels: string[];
};

const extensionOf = (path: string) => {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(path);
  return match ? match[1].toLowerCase() : 'bin';
};

/**
 * One trip out of a whole snapshot: its own rows (`filterTablesForTrip`), the travellers it names
 * and nothing else — no settings, so not the phone's "Me"; no templates; no reusable lists. Every
 * distinct file gets one archive name, and each resource row points at that name instead of the
 * phone's own storage path.
 */
export function buildTripArchive(
  all: ExportTables,
  tripId: string,
  options: {
    exportId: string;
    exportedAt: string;
    appVersion: string;
    schemaVersion: number;
    includeFiles: boolean;
    /** Facts for each stored path the trip uses; a path left out counts as missing. */
    files: ReadonlyMap<string, StoredFileFacts>;
    sha256Of: (bytes: Uint8Array) => string;
  },
): TripArchiveBuild {
  const one = filterTablesForTrip(all, tripId);
  const trip = one.trips[0];
  if (!trip) throw new Error('That trip is not in the snapshot');

  const storedPaths = [
    ...new Set(
      one.resources.flatMap((row) => (row.kind === 'file' && row.stored_path ? [row.stored_path] : [])),
    ),
  ].sort();
  const width = String(storedPaths.length).length < 3 ? 3 : String(storedPaths.length).length;
  const nameFor = new Map(
    storedPaths.map((path, index) => [
      path,
      `files/${String(index + 1).padStart(width, '0')}.${extensionOf(path)}`,
    ]),
  );

  const filesToPack = new Map<string, string>();
  const entries: ArchiveFileEntry[] = [];
  const missingPaths = new Set<string>();
  for (const path of storedPaths) {
    const name = nameFor.get(path)!;
    const facts = options.files.get(path) ?? null;
    const mimeType = one.resources.find((row) => row.stored_path === path)?.mime_type ?? null;
    if (!facts) {
      missingPaths.add(path);
      entries.push({ name, status: 'missing', sizeBytes: null, sha256: null, mimeType });
    } else if (!options.includeFiles) {
      entries.push({ name, status: 'excluded', sizeBytes: facts.sizeBytes, sha256: null, mimeType });
    } else {
      filesToPack.set(name, path);
      entries.push({ name, status: 'included', ...facts, mimeType });
    }
  }

  const resources: ResourceExportRow[] = one.resources.map((row) =>
    row.kind === 'file' && row.stored_path ? { ...row, stored_path: nameFor.get(row.stored_path)! } : row,
  );
  const tables: TripArchiveTables = {
    trips: one.trips,
    tripItems: one.tripItems,
    tripNotes: one.tripNotes,
    resources,
    expenses: one.expenses,
    payments: one.payments,
    bookingPayments: one.bookingPayments,
    costShares: one.costShares,
    tripCover: one.tripCover,
    settlements: one.settlements,
    unsplitConfirmations: one.unsplitConfirmations,
    settlementReviews: one.settlementReviews,
    tripRates: one.tripRates,
    tripExchangeRates: one.tripExchangeRates,
    travellers: one.travellers,
    tripTravellers: one.tripTravellers,
    itemParticipants: one.itemParticipants,
    lists: one.lists,
    listItems: one.listItems,
    listItemRecipients: one.listItemRecipients,
    templateUses: one.templateUses,
  };
  const dataBytes = strToU8(JSON.stringify({ kind: TRIP_ARCHIVE_KIND, tables }));

  const manifest: TripArchiveManifest = {
    kind: TRIP_ARCHIVE_KIND,
    formatVersion: TRIP_ARCHIVE_VERSION,
    rowFormat: EXPORT_FORMAT_VERSION,
    schemaVersion: options.schemaVersion,
    app: { name: 'travel-organizer', version: options.appVersion },
    exportId: options.exportId,
    exportedAt: options.exportedAt,
    sourceTripId: trip.id,
    trip: {
      name: trip.name,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
    },
    attachments: options.includeFiles ? 'included' : 'excluded',
    partial: !options.includeFiles || missingPaths.size > 0,
    data: { name: DATA_NAME, sizeBytes: dataBytes.length, sha256: options.sha256Of(dataBytes) },
    files: entries,
  };

  const missingLabels = one.resources
    .filter((row) => row.stored_path !== null && missingPaths.has(row.stored_path))
    .map((row) => row.label);
  return { manifest, dataBytes, filesToPack, missingLabels };
}

/** The zip: the two documents deflated, the files stored as they are (already compressed). */
export function packTripArchive(
  manifest: TripArchiveManifest,
  dataBytes: Uint8Array,
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const entries: Zippable = {
    [MANIFEST_NAME]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }],
    [DATA_NAME]: [dataBytes, { level: 6 }],
  };
  for (const [name, bytes] of files) {
    if (!isArchiveFileName(name)) throw new Error(`Refusing to pack ${name}`);
    entries[name] = [bytes, { level: 0 }];
  }
  return zipSync(entries);
}

/** 'Lapland-trip-2026-10-19-1530.zip': the trip's name made safe for a file name, and when. */
export function tripArchiveFileName(tripName: string, now: Date): string {
  const safe =
    tripName
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'Trip';
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${safe}-trip-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

// ─── Open (untrusted input) ──────────────────────────────────────────────────────────────────────

export type OpenedTripArchive = {
  manifest: TripArchiveManifest;
  tables: TripArchiveTables;
  /** Files whose bytes arrived whole: size and SHA-256 as the manifest says. */
  files: Map<string, Uint8Array>;
  /** Files the manifest says are included but that are absent or do not match. */
  damaged: string[];
};

export type OpenTripArchiveResult =
  | { ok: true; archive: OpenedTripArchive }
  | { ok: false; reason: string };

const refuse = (reason: string): OpenTripArchiveResult => ({ ok: false, reason });
const NOT_OURS = 'This file is not a trip exported from Travel Organizer.';

/**
 * Everything an archive must pass before anything is written, in the order that keeps the work
 * bounded: the zip's directory (names, count, declared sizes) before any byte is inflated; the
 * manifest before the data; the data's checksum before its rows; the rows' references before the
 * files. A damaged *file* does not refuse the archive — it is reported, and imported as missing —
 * but anything that could mislead does.
 */
export async function openTripArchive(
  bytes: Uint8Array,
  sha256Of: (bytes: Uint8Array) => Promise<string>,
  options: { supportedSchemaVersion: number; limits?: TripArchiveLimits },
): Promise<OpenTripArchiveResult> {
  const limits = options.limits ?? TRIP_ARCHIVE_LIMITS;
  if (bytes.length > limits.archiveBytes) {
    return refuse(`This file is larger than ${mb(limits.archiveBytes)}, the most a trip can be.`);
  }

  // The directory only: nothing is inflated in this pass.
  const listed: { name: string; originalSize: number; compression: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (info) => {
        listed.push({ name: info.name, originalSize: info.originalSize, compression: info.compression });
        return false;
      },
    });
  } catch {
    return refuse('This file is not a zip archive.');
  }

  const names = listed.map((entry) => entry.name);
  if (names.includes(BACKUP_DOCUMENT_NAME)) {
    return refuse('This is a full backup, not a trip. Use “Import a backup” to restore it.');
  }
  if (new Set(names).size !== names.length) {
    return refuse('This archive contains the same entry twice, so it cannot be trusted.');
  }
  if (listed.length > limits.entries) return refuse('This archive has too many files.');
  let total = 0;
  for (const entry of listed) {
    const document = entry.name === MANIFEST_NAME || entry.name === DATA_NAME;
    if (!document && !isArchiveFileName(entry.name)) {
      return refuse(`This archive contains an unexpected entry (${printable(entry.name)}).`);
    }
    if (entry.compression !== 0 && entry.compression !== 8) {
      return refuse('This archive uses a compression the app does not read.');
    }
    if (entry.originalSize > (document ? limits.jsonBytes : limits.entryBytes)) {
      return refuse(`An entry in this archive is too large (${printable(entry.name)}).`);
    }
    total += entry.originalSize;
  }
  if (total > limits.totalBytes) return refuse('This archive would unpack to too much data.');
  if (!names.includes(MANIFEST_NAME)) return refuse(NOT_OURS);
  if (!names.includes(DATA_NAME)) return refuse('This trip archive has no trip.json.');

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return refuse('This archive is damaged and cannot be unpacked.');
  }

  // The manifest: ours, and a version this app reads, before its details are believed.
  const manifestValue = parseJson(entries[MANIFEST_NAME]);
  if (manifestValue === undefined) return refuse('The manifest in this archive is damaged.');
  const head = z
    .object({ kind: z.string(), formatVersion: z.number(), rowFormat: z.number().optional() })
    .safeParse(manifestValue);
  if (!head.success || head.data.kind !== TRIP_ARCHIVE_KIND) return refuse(NOT_OURS);
  if (
    head.data.formatVersion > TRIP_ARCHIVE_VERSION ||
    (head.data.rowFormat ?? 0) > EXPORT_FORMAT_VERSION
  ) {
    return refuse('This trip was exported by a newer version of the app. Update the app first.');
  }
  const parsedManifest = manifestSchema.safeParse(manifestValue);
  if (!parsedManifest.success) return refuse('The manifest in this archive is not valid.');
  const manifest = parsedManifest.data;
  if (manifest.schemaVersion > options.supportedSchemaVersion) {
    return refuse('This trip was exported by a newer version of the app. Update the app first.');
  }

  // The data: exactly the bytes the manifest describes.
  const dataBytes = entries[DATA_NAME];
  if (
    dataBytes.length !== manifest.data.sizeBytes ||
    (await sha256Of(dataBytes)) !== manifest.data.sha256
  ) {
    return refuse('The trip data in this archive is damaged (its checksum does not match).');
  }
  const dataValue = parseJson(dataBytes);
  if (dataValue === undefined) return refuse('The trip data in this archive is damaged.');
  const parsedData = dataSchema.safeParse(dataValue);
  if (!parsedData.success) return refuse('The trip data in this archive is not valid.');
  const parsedTables = parsedData.data.tables;
  // Before row format 14 the rates were keyed by currency only: each becomes a pair, as migration 013.
  const tables =
    manifest.rowFormat < 14 ? { ...parsedTables, tripExchangeRates: parsedTables.tripRates } : parsedTables;

  const problem = checkTripArchive(manifest, tables);
  if (problem) return refuse(`This trip archive is inconsistent: ${problem}.`);

  // Files: only those the manifest lists as included may be present; each must match.
  const listedFiles = new Map(manifest.files.map((entry) => [entry.name, entry]));
  for (const name of names) {
    if (name === MANIFEST_NAME || name === DATA_NAME) continue;
    if (listedFiles.get(name)?.status !== 'included') {
      return refuse(`This archive contains a file its manifest does not list (${printable(name)}).`);
    }
  }
  const files = new Map<string, Uint8Array>();
  const damaged: string[] = [];
  for (const entry of manifest.files) {
    if (entry.status !== 'included') continue;
    const fileBytes = entries[entry.name];
    if (
      !fileBytes ||
      entry.sizeBytes === null ||
      entry.sha256 === null ||
      fileBytes.length !== entry.sizeBytes ||
      (await sha256Of(fileBytes)) !== entry.sha256
    ) {
      damaged.push(entry.name);
    } else {
      files.set(entry.name, fileBytes);
    }
  }
  return { ok: true, archive: { manifest, tables, files, damaged } };
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;
const printable = (name: string) => JSON.stringify(name.slice(0, 80));

function parseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return undefined;
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    return undefined;
  }
}

/**
 * Every reference inside the archive resolves inside it, and nothing would collide when written:
 * the first problem found, or null. The database's own constraints stay the last word when the
 * rows are inserted; this is what lets the screen say exactly what is wrong before then.
 */
export function checkTripArchive(
  manifest: TripArchiveManifest,
  t: TripArchiveTables,
): string | null {
  if (t.trips.length !== 1) return 'it must hold exactly one trip';
  const tripId = t.trips[0].id;
  if (tripId !== manifest.sourceTripId) return 'the manifest names a different trip';

  const unique = (rows: readonly { id: string }[], what: string) =>
    new Set(rows.map((row) => row.id)).size === rows.length ? null : `two ${what} share an id`;
  const duplicateIds =
    unique(t.tripItems, 'plans') ??
    unique(t.tripNotes, 'notes') ??
    unique(t.resources, 'documents') ??
    unique(t.expenses, 'expenses') ??
    unique(t.payments, 'payments') ??
    unique(t.bookingPayments, 'booking payments') ??
    unique(t.costShares, 'shares') ??
    unique(t.settlements, 'settlements') ??
    unique(t.unsplitConfirmations, 'unsplit cost confirmations') ??
    unique(t.settlementReviews, 'settlement reviews') ??
    unique(t.travellers, 'travellers') ??
    unique(t.lists, 'lists') ??
    unique(t.listItems, 'list items');
  if (duplicateIds) return duplicateIds;

  const items = new Set(t.tripItems.map((row) => row.id));
  const expenses = new Set(t.expenses.map((row) => row.id));
  const travellers = new Set(t.travellers.map((row) => row.id));
  const lists = new Set(t.lists.map((row) => row.id));
  const listItems = new Set(t.listItems.map((row) => row.id));
  const fileNames = new Set(manifest.files.map((entry) => entry.name));
  if (fileNames.size !== manifest.files.length) return 'the manifest lists a file twice';

  const ownedByTrip = (rows: readonly { trip_id: string | null }[]) =>
    rows.every((row) => row.trip_id === tripId);
  if (!ownedByTrip(t.tripItems)) return 'a plan belongs to another trip';
  if (!ownedByTrip(t.tripNotes)) return 'a note belongs to another trip';
  if (!ownedByTrip(t.expenses)) return 'an expense belongs to another trip';
  if (!ownedByTrip(t.payments)) return 'a payment belongs to another trip';
  if (!ownedByTrip(t.bookingPayments)) return 'a booking payment belongs to another trip';
  if (!ownedByTrip(t.costShares)) return 'a share belongs to another trip';
  if (!ownedByTrip(t.tripCover)) return 'who covers a child belongs to another trip';
  if (!ownedByTrip(t.settlements)) return 'a settlement belongs to another trip';
  if (!ownedByTrip(t.unsplitConfirmations)) return 'an unsplit cost kept outside belongs to another trip';
  if (!ownedByTrip(t.settlementReviews)) return 'a settlement review belongs to another trip';
  if (!ownedByTrip(t.tripRates)) return 'an exchange rate belongs to another trip';
  if (!ownedByTrip(t.tripExchangeRates)) return 'an exchange rate belongs to another trip';
  if (!ownedByTrip(t.lists)) return 'a list belongs to another trip';
  if (!ownedByTrip(t.tripTravellers)) return 'a traveller is listed on another trip';
  if (!ownedByTrip(t.templateUses)) return 'a template record belongs to another trip';

  for (const row of t.resources) {
    const onTrip = row.trip_id !== null;
    if (onTrip === (row.trip_item_id !== null)) return 'a document has no single owner';
    if (onTrip && row.trip_id !== tripId) return 'a document belongs to another trip';
    if (!onTrip && !items.has(row.trip_item_id!)) return 'a document belongs to a missing plan';
    if (row.expense_id !== null && (!onTrip || !expenses.has(row.expense_id))) {
      return 'a receipt belongs to a missing expense';
    }
    if (row.kind === 'link' && !row.url) return 'a link has no address';
    if (row.kind === 'file' && (!row.stored_path || !fileNames.has(row.stored_path))) {
      return 'a document points at a file the manifest does not list';
    }
    if (row.kind !== 'file' && row.kind !== 'link') return 'a document is of an unknown kind';
  }

  // A payer is on the trip (invariant P); members are remapped with the same choices, so they
  // stay on it here.
  const members = new Set(t.tripTravellers.map((row) => row.traveller_id));
  const pairs = (rows: readonly string[]) => new Set(rows).size === rows.length;
  if (!pairs(t.tripRates.map((row) => row.currency))) return 'a currency has two rates';
  if (!pairs(t.tripExchangeRates.map((row) => `${row.currency}>${row.base_currency}`))) {
    return 'a currency pair has two rates';
  }
  for (const row of t.bookingPayments) {
    if (!items.has(row.trip_item_id)) return 'a payment is for a missing booking';
    if (row.payer_id !== null && !travellers.has(row.payer_id)) {
      return 'a payment names a payer who is not in the archive';
    }
    if (row.payer_id !== null && !members.has(row.payer_id)) {
      return 'a payment names a payer who is not on the trip';
    }
  }
  for (const row of t.expenses) {
    if (row.trip_item_id !== null && !items.has(row.trip_item_id)) {
      return 'an expense pays for a missing booking';
    }
    if (row.payer_id !== null && !travellers.has(row.payer_id)) {
      return 'an expense names a payer who is not in the archive';
    }
    if (row.payer_id !== null && !members.has(row.payer_id)) {
      return 'an expense names a payer who is not on the trip';
    }
  }
  // Shares and covers name members of the trip only (3D-2; the database checks it too).
  for (const row of t.costShares) {
    if ((row.trip_item_id === null) === (row.expense_id === null)) return 'a share has no single cost';
    if (row.trip_item_id !== null && !items.has(row.trip_item_id)) return 'a share is for a missing plan';
    if (row.expense_id !== null && !expenses.has(row.expense_id)) return 'a share is for a missing expense';
    if (!members.has(row.traveller_id)) return 'a share names someone who is not on the trip';
    if (row.covered_by !== null && !members.has(row.covered_by)) {
      return 'a share is covered by someone who is not on the trip';
    }
  }
  if (!pairs(t.costShares.map((row) => `${row.trip_item_id ?? row.expense_id}|${row.traveller_id}`))) {
    return 'someone has two shares of one cost';
  }
  for (const row of t.tripCover) {
    if (!members.has(row.child_id) || !members.has(row.adult_id) || row.child_id === row.adult_id) {
      return 'who covers a child names someone who is not on the trip';
    }
  }
  // Settlements name two different members of the trip (3E; the database checks it too).
  for (const row of t.settlements) {
    if (!members.has(row.from_id) || !members.has(row.to_id)) {
      return 'a settlement names someone who is not on the trip';
    }
    if (row.from_id === row.to_id) return 'a settlement is from someone to themselves';
    if (!Number.isInteger(row.amount) || row.amount <= 0) return 'a settlement has no amount';
  }
  // A cost kept outside is one booking or one expense of this trip, once (review P1).
  for (const row of t.unsplitConfirmations) {
    if ((row.trip_item_id === null) === (row.expense_id === null)) return 'a cost kept outside has no single cost';
    if (row.trip_item_id !== null && !items.has(row.trip_item_id)) return 'a cost kept outside is a missing plan';
    if (row.expense_id !== null && !expenses.has(row.expense_id)) return 'a cost kept outside is a missing expense';
  }
  if (!pairs(t.unsplitConfirmations.map((row) => row.trip_item_id ?? row.expense_id!))) {
    return 'a cost is kept outside twice';
  }
  // A review names where a cost went only when it moved (§15.3).
  for (const row of t.settlementReviews) {
    if ((row.reason === 'moved') !== (row.to_currency !== null)) return 'a settlement review does not say where a cost moved';
  }

  if (!t.tripTravellers.every((row) => travellers.has(row.traveller_id))) {
    return 'the trip names a traveller who is not in the archive';
  }
  if (!pairs(t.tripTravellers.map((row) => row.traveller_id))) return 'a traveller is on the trip twice';
  if (!t.itemParticipants.every((row) => items.has(row.item_id) && travellers.has(row.traveller_id))) {
    return 'who goes to a plan names a missing plan or traveller';
  }
  if (!pairs(t.itemParticipants.map((row) => `${row.item_id}|${row.traveller_id}`))) {
    return 'someone goes to the same plan twice';
  }
  if (!t.listItems.every((row) => lists.has(row.list_id))) return 'a list item belongs to a missing list';
  if (
    !t.listItemRecipients.every(
      (row) => listItems.has(row.list_item_id) && travellers.has(row.traveller_id),
    )
  ) {
    return 'who a list item is for names a missing item or traveller';
  }
  if (!pairs(t.listItemRecipients.map((row) => `${row.list_item_id}|${row.traveller_id}`))) {
    return 'a list item is for the same person twice';
  }
  return null;
}

// ─── Preview ─────────────────────────────────────────────────────────────────────────────────────

export type TripArchiveSummary = {
  plans: number;
  tasks: number;
  bookings: number;
  places: number;
  travellers: number;
  notes: number;
  lists: number;
  listItems: number;
  documents: number;
  links: number;
  receipts: number;
  expenses: number;
  payments: number;
  /** Payments recorded against bookings (3D-1); `payments` is the legacy, unused table. */
  bookingPayments: number;
  /** Bookings and expenses with a split (3D-2). */
  splitCosts: number;
  /** Settlements between travellers (3E). */
  settlements: number;
  filesIncluded: number;
  /** Files that will not be on the phone after the import, with the reason. */
  unavailable: { name: string; reason: 'excluded' | 'missing' | 'damaged' }[];
};

export function summariseTripArchive(archive: OpenedTripArchive): TripArchiveSummary {
  const { tables: t, manifest, damaged } = archive;
  const damagedSet = new Set(damaged);
  const unavailable: TripArchiveSummary['unavailable'] = [];
  for (const entry of manifest.files) {
    if (entry.status === 'excluded') unavailable.push({ name: entry.name, reason: 'excluded' });
    else if (entry.status === 'missing') unavailable.push({ name: entry.name, reason: 'missing' });
    else if (damagedSet.has(entry.name)) unavailable.push({ name: entry.name, reason: 'damaged' });
  }
  const notTasks = t.tripItems.filter((item) => item.kind !== 'task');
  return {
    plans: notTasks.length,
    tasks: t.tripItems.length - notTasks.length,
    bookings: notTasks.filter((item) => item.status === 'confirmed').length,
    places: notTasks.filter((item) => item.status === 'idea').length,
    travellers: t.travellers.length,
    notes: t.tripNotes.length,
    lists: t.lists.length,
    listItems: t.listItems.length,
    documents: t.resources.filter((row) => row.kind === 'file' && row.expense_id === null).length,
    links: t.resources.filter((row) => row.kind === 'link').length,
    receipts: t.resources.filter((row) => row.expense_id !== null).length,
    expenses: t.expenses.length,
    payments: t.payments.length,
    bookingPayments: t.bookingPayments.length,
    splitCosts: new Set(t.costShares.map((row) => row.trip_item_id ?? row.expense_id)).size,
    settlements: t.settlements.length,
    filesIncluded: archive.files.size,
    unavailable,
  };
}

/** The labels of the documents a file that will not arrive belongs to, for the preview. */
export function unavailableLabels(archive: OpenedTripArchive): string[] {
  const names = new Set(summariseTripArchive(archive).unavailable.map((entry) => entry.name));
  return archive.tables.resources
    .filter((row) => row.kind === 'file' && row.stored_path !== null && names.has(row.stored_path))
    .map((row) => row.label);
}

/**
 * The labels of documents whose file the archive says it includes but that arrived damaged or
 * not at all — the import asks before going on without them (2B).
 */
export function damagedLabels(archive: OpenedTripArchive): string[] {
  const damaged = new Set(archive.damaged);
  return archive.tables.resources
    .filter((row) => row.kind === 'file' && row.stored_path !== null && damaged.has(row.stored_path))
    .map((row) => row.label);
}

// ─── Import plan: new ids for everything ─────────────────────────────────────────────────────────

/** For each traveller in the archive: a new profile (the default), or one already here. */
export type TravellerChoice = { kind: 'new' } | { kind: 'existing'; id: string };

export type TripImportPlan = {
  tripId: string;
  tables: TripArchiveTables;
  /** Files to write: the archive's bytes under a new stored path each. */
  files: { archiveName: string; storedPath: string }[];
  /** Documents imported without their file, by label, and why. */
  unavailable: { label: string; reason: 'excluded' | 'missing' | 'damaged' }[];
};

/**
 * The archive rewritten for this phone: a new id for the trip and every row, every reference
 * through the same map, so nothing in it can collide with or point at anything already here.
 * Travellers become new profiles unless a choice links one to an existing profile — never by
 * name alone. Files get new stored paths, one per distinct file, shared again by every row that
 * shared it; a file that did not arrive leaves its row pointing at a path that does not exist,
 * which the app shows as *Missing — attach again*.
 *
 * `listItems.traveller_id` (legacy, unread since migration 006) is cleared rather than remapped;
 * who an item is for travels in `listItemRecipients`. `lists.source_list_id` is cleared: it names
 * a reusable list on the exporting phone. `templateUses` keep their template id — provenance
 * only, as in the full backup.
 */
export function planTripImport(
  archive: OpenedTripArchive,
  options: {
    newId: () => string;
    now: string;
    tripName: string;
    choices: ReadonlyMap<string, TravellerChoice>;
  },
): TripImportPlan {
  const t = archive.tables;
  const { newId } = options;
  const mapIds = (rows: readonly { id: string }[]) =>
    new Map(rows.map((row) => [row.id, newId()] as const));
  const must = (map: ReadonlyMap<string, string>, id: string, what: string) => {
    const mapped = map.get(id);
    if (!mapped) throw new Error(`No new id for ${what} ${id}`);
    return mapped;
  };

  const tripId = newId();
  const itemIds = mapIds(t.tripItems);
  const noteIds = mapIds(t.tripNotes);
  const expenseIds = mapIds(t.expenses);
  const paymentIds = mapIds(t.payments);
  const bookingPaymentIds = mapIds(t.bookingPayments);
  const costShareIds = mapIds(t.costShares);
  const settlementIds = mapIds(t.settlements);
  const confirmationIds = mapIds(t.unsplitConfirmations);
  const reviewIds = mapIds(t.settlementReviews);
  const resourceIds = mapIds(t.resources);
  const listIds = mapIds(t.lists);
  const listItemIds = mapIds(t.listItems);

  const travellerIds = new Map<string, string>();
  const newTravellers = [];
  for (const traveller of t.travellers) {
    const choice = options.choices.get(traveller.id) ?? { kind: 'new' };
    if (choice.kind === 'existing') {
      travellerIds.set(traveller.id, choice.id);
    } else {
      const id = newId();
      travellerIds.set(traveller.id, id);
      newTravellers.push({ ...traveller, id, created_at: options.now, updated_at: options.now });
    }
  }

  // One journey keeps one id, a new one (U7: legs are tied by details.journeyId).
  const journeyIds = new Map<string, string>();
  const remapDetails = (details: string | null): string | null => {
    if (details === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(details);
    } catch {
      return details;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return details;
    const record = parsed as Record<string, unknown>;
    if (typeof record.journeyId !== 'string') return details;
    if (!journeyIds.has(record.journeyId)) journeyIds.set(record.journeyId, newId());
    return JSON.stringify({ ...record, journeyId: journeyIds.get(record.journeyId) });
  };

  // One new stored path per distinct file, named by the first row that uses it (as on the phone).
  const unavailableReason = new Map(
    summariseTripArchive(archive).unavailable.map((entry) => [entry.name, entry.reason] as const),
  );
  const storedPathFor = new Map<string, string>();
  const files: TripImportPlan['files'] = [];
  const unavailable: TripImportPlan['unavailable'] = [];
  const resources = t.resources.map((row) => {
    const id = must(resourceIds, row.id, 'document');
    let stored_path = row.stored_path;
    if (row.kind === 'file' && row.stored_path) {
      const archiveName = row.stored_path;
      if (!storedPathFor.has(archiveName)) {
        const path = `${MEDIA_DIR}/${id}.${extensionOf(archiveName)}`;
        storedPathFor.set(archiveName, path);
        if (archive.files.has(archiveName)) files.push({ archiveName, storedPath: path });
      }
      stored_path = storedPathFor.get(archiveName)!;
      const reason = unavailableReason.get(archiveName);
      if (reason) unavailable.push({ label: row.label, reason });
    }
    return {
      ...row,
      id,
      trip_id: row.trip_id === null ? null : tripId,
      trip_item_id: row.trip_item_id === null ? null : must(itemIds, row.trip_item_id, 'plan'),
      expense_id: row.expense_id === null ? null : must(expenseIds, row.expense_id, 'expense'),
      stored_path,
    };
  });

  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));
  const trip = t.trips[0];

  return {
    tripId,
    files,
    unavailable,
    tables: {
      trips: [{ ...trip, id: tripId, name: options.tripName }],
      tripItems: t.tripItems.map((row) => ({
        ...row,
        id: must(itemIds, row.id, 'plan'),
        trip_id: tripId,
        details: remapDetails(row.details),
      })),
      tripNotes: t.tripNotes.map((row) => ({ ...row, id: must(noteIds, row.id, 'note'), trip_id: tripId })),
      resources,
      expenses: t.expenses.map((row) => ({
        ...row,
        id: must(expenseIds, row.id, 'expense'),
        trip_id: tripId,
        trip_item_id: row.trip_item_id === null ? null : must(itemIds, row.trip_item_id, 'plan'),
        payer_id: row.payer_id === null ? null : must(travellerIds, row.payer_id, 'traveller'),
      })),
      payments: t.payments.map((row) => ({
        ...row,
        id: must(paymentIds, row.id, 'payment'),
        trip_id: tripId,
      })),
      bookingPayments: t.bookingPayments.map((row) => ({
        ...row,
        id: must(bookingPaymentIds, row.id, 'booking payment'),
        trip_id: tripId,
        trip_item_id: must(itemIds, row.trip_item_id, 'plan'),
        payer_id: row.payer_id === null ? null : must(travellerIds, row.payer_id, 'traveller'),
      })),
      costShares: t.costShares.map((row) => {
        const mapped = {
          ...row,
          id: must(costShareIds, row.id, 'share'),
          trip_id: tripId,
          trip_item_id: row.trip_item_id === null ? null : must(itemIds, row.trip_item_id, 'plan'),
          expense_id: row.expense_id === null ? null : must(expenseIds, row.expense_id, 'expense'),
          traveller_id: must(travellerIds, row.traveller_id, 'traveller'),
          covered_by: row.covered_by === null ? null : must(travellerIds, row.covered_by, 'traveller'),
        };
        // Never merged: two people's amounts cannot become one person's, nor a child cover their
        // own share (the preview refuses the choice that would do it — one profile for two people
        // in the file).
        if (
          !once(`cs|${mapped.trip_item_id ?? mapped.expense_id}|${mapped.traveller_id}`) ||
          mapped.covered_by === mapped.traveller_id
        ) {
          throw new Error('Two people in the file are linked to one profile here, and a split names both');
        }
        return mapped;
      }),
      tripCover: t.tripCover
        .map((row) => ({
          ...row,
          trip_id: tripId,
          child_id: must(travellerIds, row.child_id, 'traveller'),
          adult_id: must(travellerIds, row.adult_id, 'traveller'),
        }))
        .filter((row) => row.child_id !== row.adult_id && once(`tc|${row.child_id}|${row.adult_id}`)),
      settlements: t.settlements.map((row) => {
        const mapped = {
          ...row,
          id: must(settlementIds, row.id, 'settlement'),
          trip_id: tripId,
          from_id: must(travellerIds, row.from_id, 'traveller'),
          to_id: must(travellerIds, row.to_id, 'traveller'),
        };
        // Never merged into one person: a settlement from someone to themselves means nothing (the
        // preview refuses the choice that would do it — one profile for two people in the file).
        if (mapped.from_id === mapped.to_id) {
          throw new Error('Two people in the file are linked to one profile here, and a settlement names both');
        }
        return mapped;
      }),
      // The cost's new id, and its travellers renamed inside the fingerprint, so it still matches the
      // same cost here; someone the file does not name stays as written and matches nothing.
      unsplitConfirmations: t.unsplitConfirmations.map((row) => ({
        ...row,
        id: must(confirmationIds, row.id, 'unsplit cost confirmation'),
        trip_id: tripId,
        trip_item_id: row.trip_item_id === null ? null : must(itemIds, row.trip_item_id, 'plan'),
        expense_id: row.expense_id === null ? null : must(expenseIds, row.expense_id, 'expense'),
        fingerprint: remapFingerprint(row.fingerprint, (id) => travellerIds.get(id) ?? id),
      })),
      // The trip and currency it holds, as they were: open stays open, acknowledged stays so.
      settlementReviews: t.settlementReviews.map((row) => ({
        ...row,
        id: must(reviewIds, row.id, 'settlement review'),
        trip_id: tripId,
      })),
      // As typed, against the reporting currency they were set for.
      tripRates: t.tripRates.map((row) => ({ ...row, trip_id: tripId })),
      tripExchangeRates: t.tripExchangeRates.map((row) => ({ ...row, trip_id: tripId })),
      travellers: newTravellers,
      // Two archive travellers linked to one profile here become one member, one participant.
      tripTravellers: t.tripTravellers
        .map((row) => ({
          ...row,
          trip_id: tripId,
          traveller_id: must(travellerIds, row.traveller_id, 'traveller'),
        }))
        .filter((row) => once(`tt|${row.traveller_id}`)),
      itemParticipants: t.itemParticipants
        .map((row) => ({
          item_id: must(itemIds, row.item_id, 'plan'),
          traveller_id: must(travellerIds, row.traveller_id, 'traveller'),
        }))
        .filter((row) => once(`ip|${row.item_id}|${row.traveller_id}`)),
      lists: t.lists.map((row) => ({
        ...row,
        id: must(listIds, row.id, 'list'),
        trip_id: tripId,
        source_list_id: null,
      })),
      listItems: t.listItems.map((row) => ({
        ...row,
        id: must(listItemIds, row.id, 'list item'),
        list_id: must(listIds, row.list_id, 'list'),
        traveller_id: null,
      })),
      listItemRecipients: t.listItemRecipients
        .map((row) => ({
          list_item_id: must(listItemIds, row.list_item_id, 'list item'),
          traveller_id: must(travellerIds, row.traveller_id, 'traveller'),
        }))
        .filter((row) => once(`lr|${row.list_item_id}|${row.traveller_id}`)),
      templateUses: t.templateUses.map((row) => ({ ...row, trip_id: tripId })),
    },
  };
}

/** 'Lapland', or 'Lapland (2)' when a trip of that name is here already. */
export function uniqueTripName(name: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((one) => one.trim().toLocaleLowerCase()));
  if (!taken.has(name.trim().toLocaleLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/**
 * Travellers here an archive traveller might be — same name, ignoring case and spacing. Offered,
 * never chosen: two people can share a name.
 */
export function possibleMatches<T extends { name: string }>(
  archiveName: string,
  here: readonly T[],
): T[] {
  const key = archiveName.trim().toLocaleLowerCase();
  return here.filter((person) => person.name.trim().toLocaleLowerCase() === key);
}

// ─── Provenance: has this been imported before? ──────────────────────────────────────────────────

/** Kept in `settings.trip_imports` (no migration): one entry per import done on this phone. */
const importRecordSchema = z.object({
  exportId: z.string(),
  sourceTripId: z.string(),
  tripId: z.string(),
  importedAt: z.string(),
});
export type ImportRecord = z.infer<typeof importRecordSchema>;

export function parseImportHistory(json: string | null): ImportRecord[] {
  if (!json) return [];
  try {
    const parsed = z.array(importRecordSchema).safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function withImport(history: readonly ImportRecord[], record: ImportRecord): string {
  return JSON.stringify([...history, record]);
}

export type EarlierImport =
  | { kind: 'sameFile'; tripId: string; importedAt: string }
  | { kind: 'sameTrip'; tripId: string; importedAt: string }
  | { kind: 'original'; tripId: string };

/**
 * Whether this trip is here already, by provenance, not by name: the same export imported
 * before; another export of the same trip imported before; or the very trip it was exported from.
 * Only imports whose trip still exists count. Null when none.
 */
export function earlierImport(
  manifest: Pick<TripArchiveManifest, 'exportId' | 'sourceTripId'>,
  history: readonly ImportRecord[],
  existingTripIds: Iterable<string>,
): EarlierImport | null {
  const here = new Set(existingTripIds);
  const live = history.filter((record) => here.has(record.tripId));
  const sameFile = live.find((record) => record.exportId === manifest.exportId);
  if (sameFile) return { kind: 'sameFile', tripId: sameFile.tripId, importedAt: sameFile.importedAt };
  const sameTrip = live.find((record) => record.sourceTripId === manifest.sourceTripId);
  if (sameTrip) return { kind: 'sameTrip', tripId: sameTrip.tripId, importedAt: sameTrip.importedAt };
  if (here.has(manifest.sourceTripId)) return { kind: 'original', tripId: manifest.sourceTripId };
  return null;
}
