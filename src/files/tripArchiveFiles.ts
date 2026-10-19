/**
 * The phone side of the single-trip archive (2B): reading a trip and its files into a zip, sharing
 * it, and writing a picked one back as a new trip. The format and every decision live in
 * `domain/tripArchive`; this file moves bytes, hashes them, and cleans up after a failure.
 */

import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { LATEST_VERSION } from '../db/migrations';
import { filterTablesForTrip } from '../domain/export';
import {
  buildTripArchive,
  openTripArchive,
  packTripArchive,
  TRIP_ARCHIVE_LIMITS,
  tripArchiveFileName,
  type OpenedTripArchive,
  type OpenTripArchiveResult,
  type StoredFileFacts,
  type TripArchiveManifest,
  type TripImportPlan,
} from '../domain/tripArchive';
import { readAllTables } from '../repositories/backup';
import { applyTripImport, verifyTripImport, type ImportCheck } from '../repositories/tripImport';
import {
  deleteStoredFile,
  readFileBytes,
  readStoredFile,
  storedFileExists,
  storedFileSize,
  writeStoredFile,
} from './storage';

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes as Uint8Array<ArrayBuffer>,
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ─── Export ──────────────────────────────────────────────────────────────────────────────────────

export type TripFilesCheck = {
  /** Distinct files the trip's documents and receipts use. */
  files: number;
  totalBytes: number;
  /** Labels of documents whose file is no longer on this phone. */
  missingLabels: string[];
};

/** What the export screen says before anything is made: how much, and what is already missing. */
export async function checkTripFiles(db: SQLiteDatabase, tripId: string): Promise<TripFilesCheck> {
  const { resources } = filterTablesForTrip(await readAllTables(db), tripId);
  const paths = [...new Set(resources.flatMap((row) => (row.stored_path ? [row.stored_path] : [])))];
  let totalBytes = 0;
  const missing = new Set<string>();
  for (const path of paths) {
    const size = storedFileSize(path);
    if (size === null) missing.add(path);
    else totalBytes += size;
  }
  return {
    files: paths.length,
    totalBytes,
    missingLabels: resources
      .filter((row) => row.stored_path !== null && missing.has(row.stored_path))
      .map((row) => row.label),
  };
}

export type ExportedTrip = { uri: string; manifest: TripArchiveManifest; missingLabels: string[] };

/**
 * Builds the archive in the cache (shared at once, so the OS reclaiming it later is fine). The
 * rows are one snapshot; each file is read once, hashed, and packed under its archive name.
 */
export async function createTripArchive(
  db: SQLiteDatabase,
  tripId: string,
  includeFiles: boolean,
): Promise<ExportedTrip> {
  const all = await readAllTables(db);
  const { resources } = filterTablesForTrip(all, tripId);
  const paths = [...new Set(resources.flatMap((row) => (row.stored_path ? [row.stored_path] : [])))];

  const facts = new Map<string, StoredFileFacts>();
  const bytesOf = new Map<string, Uint8Array>();
  for (const path of paths) {
    const bytes = await readStoredFile(path);
    if (!bytes) continue;
    facts.set(path, { sizeBytes: bytes.length, sha256: await sha256Hex(bytes) });
    if (includeFiles) bytesOf.set(path, bytes);
  }

  // The pure builder hashes synchronously; expo-crypto is asynchronous, so the data's checksum
  // is taken here, from the very bytes that are packed, and set on the manifest.
  const now = new Date();
  const built = buildTripArchive(all, tripId, {
    exportId: Crypto.randomUUID(),
    exportedAt: now.toISOString(),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    schemaVersion: LATEST_VERSION,
    includeFiles,
    files: facts,
    sha256Of: () => '0'.repeat(64),
  });
  const manifest: TripArchiveManifest = {
    ...built.manifest,
    data: { ...built.manifest.data, sha256: await sha256Hex(built.dataBytes) },
  };

  const files = new Map<string, Uint8Array>();
  for (const [name, path] of built.filesToPack) files.set(name, bytesOf.get(path)!);

  const archive = new File(Paths.cache, tripArchiveFileName(manifest.trip.name, now));
  if (archive.exists) archive.delete();
  archive.create();
  archive.write(packTripArchive(manifest, built.dataBytes, files));
  return { uri: archive.uri, manifest, missingLabels: built.missingLabels };
}

export async function shareTripArchive(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Share this trip' });
}

// ─── Import ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Null when the picker is dismissed. The size is checked before a byte is read; the picker's
 * copy in the cache is read in chunks (see `pickBackup`) and deleted afterwards.
 */
export async function pickTripArchive(): Promise<OpenTripArchiveResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const copy = new File(picked.assets[0].uri);
  try {
    if (copy.size > TRIP_ARCHIVE_LIMITS.archiveBytes) {
      return { ok: false, reason: 'This file is too large to be a trip from Travel Organizer.' };
    }
    return await openTripArchive(readFileBytes(copy), sha256Hex, {
      supportedSchemaVersion: LATEST_VERSION,
    });
  } finally {
    if (copy.exists) copy.delete();
  }
}

export type TripImportResult =
  | { ok: true; tripId: string; check: ImportCheck; filesWritten: number }
  | { ok: false; stage: 'files' | 'database'; reason: string };

/**
 * Files first, under new names that cannot exist yet, each read back and checked; then every row
 * in one transaction. SQLite and the file system cannot share a transaction, so a failure is
 * compensated: the transaction rolls back and the files this import wrote are deleted. A kill
 * between the two leaves only those new, unreferenced files, which the launch sweep deletes.
 * Nothing that was on the phone is written to or deleted at any point.
 *
 * After the commit, the rows and files are checked against the plan; a shortfall is reported,
 * never repaired by deleting the new trip.
 */
export async function importTripArchive(
  db: SQLiteDatabase,
  archive: OpenedTripArchive,
  plan: TripImportPlan,
): Promise<TripImportResult> {
  const written: string[] = [];
  const undoFiles = () => written.forEach(deleteStoredFile);
  const expected = new Map(archive.manifest.files.map((entry) => [entry.name, entry]));

  try {
    for (const file of plan.files) {
      if (storedFileExists(file.storedPath)) throw new Error('A file of that name already exists');
      const bytes = archive.files.get(file.archiveName);
      if (!bytes) throw new Error('A file to import is not in the archive');
      written.push(file.storedPath);
      writeStoredFile(file.storedPath, bytes);
      const back = await readStoredFile(file.storedPath);
      const entry = expected.get(file.archiveName);
      if (!back || back.length !== bytes.length || (await sha256Hex(back)) !== entry?.sha256) {
        throw new Error('A file did not save intact');
      }
    }
  } catch (error) {
    undoFiles();
    return { ok: false, stage: 'files', reason: messageOf(error) };
  }

  try {
    await applyTripImport(db, plan, {
      exportId: archive.manifest.exportId,
      sourceTripId: archive.manifest.sourceTripId,
      importedAt: new Date().toISOString(),
    });
  } catch (error) {
    undoFiles();
    return { ok: false, stage: 'database', reason: messageOf(error) };
  }

  const check = await verifyTripImport(db, plan);
  const lost = plan.files.filter((file) => !storedFileExists(file.storedPath));
  const merged: ImportCheck =
    lost.length === 0
      ? check
      : {
          ok: false,
          problems: [...(check.ok ? [] : check.problems), `${lost.length} file(s) not found after saving`],
        };
  return { ok: true, tripId: plan.tripId, check: merged, filesWritten: written.length };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
