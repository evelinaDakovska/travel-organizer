/**
 * The backup archive: `backup.json` plus every stored file under `media/`. Pure — fflate builds and
 * reads the zip in memory, so packing and unpacking run in node tests exactly as on the phone.
 */

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { parseExportDocument, type ExportDocument, type ImportPlan } from './export';
import { isStoredPath } from './resource';

export const BACKUP_DOCUMENT_NAME = 'backup.json';

/** PDFs and photos are already compressed, so they are stored as they are; only the JSON is deflated. */
export function packBackup(
  document: ExportDocument,
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const entries: Zippable = {
    [BACKUP_DOCUMENT_NAME]: [strToU8(JSON.stringify(document, null, 2)), { level: 6 }],
  };
  for (const [storedPath, bytes] of files) {
    if (!isStoredPath(storedPath)) throw new Error(`Refusing to pack ${storedPath}`);
    entries[storedPath] = [bytes, { level: 0 }];
  }
  return zipSync(entries);
}

export type UnpackedBackup = { document: ExportDocument; files: Map<string, Uint8Array> };

export type UnpackResult = { ok: true; backup: UnpackedBackup } | { ok: false; reason: string };

/** Only `media/<file>` entries are kept, so a crafted archive cannot write anywhere else. */
export function unpackBackup(bytes: Uint8Array): UnpackResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return { ok: false, reason: 'This file is not a zip archive.' };
  }

  const json = entries[BACKUP_DOCUMENT_NAME];
  if (!json) return { ok: false, reason: 'This zip has no backup.json, so it is not one of our backups.' };

  let value: unknown;
  try {
    value = JSON.parse(strFromU8(json));
  } catch {
    return { ok: false, reason: 'The backup.json inside this zip is damaged.' };
  }

  const parsed = parseExportDocument(value);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (isStoredPath(name)) files.set(name, data);
  }
  return { ok: true, backup: { document: parsed.document, files } };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What went into the archive, and what is still to do (A4). The app cannot know where the share
 * sheet put it — or whether it was dismissed — so it never claims the data is backed up.
 */
export function summariseExport(document: ExportDocument, packedFiles: number): string {
  const contents = `${plural(document.tables.trips.length, 'trip')} and ${plural(packedFiles, 'saved file')}`;
  const unreadable = document.files.length - packedFiles;
  const missing =
    unreadable > 0
      ? ` ${plural(unreadable, 'file')} ${unreadable === 1 ? 'was' : 'were'} already missing on this phone.`
      : '';
  return (
    `Archive created with ${contents}.${missing} ` +
    'It is only a backup once it is saved somewhere off this phone — Drive, or email it to yourself.'
  );
}

/** What an import is about to do, in the words the confirmation dialog shows. */
export function summariseImportPlan(plan: ImportPlan): string {
  const { write, skippedTripIds, missingFiles, mode } = plan;

  if (write.trips.length === 0) {
    return 'Everything in this backup is already on this phone, so nothing will change.';
  }

  const stored = new Set(
    write.resources.flatMap((r) => (r.kind === 'file' && r.stored_path ? [r.stored_path] : [])),
  );
  const files = stored.size - missingFiles.length;

  // Expenses only when there are some, so a backup from before them reads as it always did.
  const parts = [
    plural(write.trips.length, 'trip'),
    plural(write.tripItems.length, 'item'),
    plural(write.tripNotes.length, 'note'),
    ...(write.expenses.length > 0 ? [plural(write.expenses.length, 'expense')] : []),
  ];
  const sentences = [`Adds ${parts.join(', ')} and ${plural(files, 'saved file')}.`];

  if (mode === 'replace') {
    sentences.push("Any of these trips already on this phone is replaced by the backup's copy.");
  } else if (skippedTripIds.length > 0) {
    const one = skippedTripIds.length === 1;
    sentences.push(
      `${plural(skippedTripIds.length, 'trip')} already here ${one ? 'is' : 'are'} left as ${one ? 'it is' : 'they are'}.`,
    );
  }

  if (missingFiles.length > 0) {
    const one = missingFiles.length === 1;
    sentences.push(
      `${plural(missingFiles.length, 'file')} ${one ? 'is' : 'are'} missing from the backup and will show as missing.`,
    );
  }

  return sentences.join(' ');
}
