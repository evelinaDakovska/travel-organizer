/**
 * The phone side of backup: reading tables and files into a zip, handing it to the share sheet,
 * and writing a picked zip back. The format and the decisions live in `domain/export` and
 * `domain/archive`; this file only moves bytes.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  packBackup,
  unpackBackup,
  type UnpackedBackup,
  type UnpackResult,
} from '../domain/archive';
import {
  buildExportDocument,
  exportFileName,
  planImport,
  type ExportDocument,
  type ImportMode,
  type ImportPlan,
} from '../domain/export';
import { applyImport, listTripIds, readAllTables } from '../repositories/backup';
import { readStoredFile, storedFileExists, storedFileSize, writeStoredFile } from './storage';

export type ExportedBackup = { uri: string; document: ExportDocument; packedFiles: number };

/** Builds the zip in the cache, which the OS may reclaim — fine, since it is shared straight away. */
export async function exportBackup(db: SQLiteDatabase): Promise<ExportedBackup> {
  const tables = await readAllTables(db);
  const now = new Date();
  const exportedAt = now.toISOString();
  const document = buildExportDocument(tables, { exportedAt, sizeOf: storedFileSize });

  const files = new Map<string, Uint8Array>();
  for (const entry of document.files) {
    const bytes = await readStoredFile(entry.storedPath);
    if (bytes) files.set(entry.storedPath, bytes);
  }

  const archive = new File(Paths.cache, exportFileName(now));
  if (archive.exists) archive.delete();
  archive.create();
  archive.write(packBackup(document, files));

  return { uri: archive.uri, document, packedFiles: files.size };
}

export async function shareBackup(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Save your backup' });
}

/**
 * Null when the picker is dismissed. Any file can be picked: providers report zips under several
 * mime types, and unpacking explains clearly when the file is not one of ours.
 */
export async function pickBackup(): Promise<UnpackResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false });
  if (picked.canceled) return null;

  const bytes = await new File(picked.assets[0].uri).bytes();
  return unpackBackup(bytes);
}

export async function planBackupImport(
  db: SQLiteDatabase,
  backup: UnpackedBackup,
  mode: ImportMode,
): Promise<ImportPlan> {
  return planImport(backup.document, await listTripIds(db), mode, backup.files.keys());
}

/**
 * Files first, rows second: if writing the rows fails, the new files are orphans the start-up sweep
 * collects — never a row pointing at nothing. A file already on the phone is kept, since stored
 * names are unique ids.
 */
export async function applyBackupImport(
  db: SQLiteDatabase,
  backup: UnpackedBackup,
  plan: ImportPlan,
): Promise<void> {
  for (const resource of plan.write.resources) {
    if (resource.kind !== 'file' || !resource.stored_path) continue;
    const bytes = backup.files.get(resource.stored_path);
    if (bytes && !storedFileExists(resource.stored_path)) writeStoredFile(resource.stored_path, bytes);
  }
  await applyImport(db, plan);
}
