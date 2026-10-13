/**
 * Everything touching the filesystem. Files are copied in on import and never referenced
 * by their original URI — Android grants only temporary permission on those.
 */

import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

import { readInChunks } from '../domain/archive';
import {
  isStoredPath,
  MEDIA_DIR,
  orphanedStoredPaths,
  storedPathFor,
  toAbsoluteUri,
  viewerFileName,
  toStoredPath,
  type FileResource,
} from '../domain/resource';

export type ImportedFile = {
  storedPath: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

function ensureMediaDirectory(): void {
  const directory = new Directory(Paths.document, MEDIA_DIR);
  if (!directory.exists) directory.create({ intermediates: true });
}

export function absoluteUriFor(storedPath: string): string {
  return toAbsoluteUri(Paths.document.uri, storedPath);
}

export function storedFileExists(storedPath: string): boolean {
  return new File(absoluteUriFor(storedPath)).exists;
}

export function storedFileSize(storedPath: string): number | null {
  const file = new File(absoluteUriFor(storedPath));
  return file.exists ? file.size : null;
}

/**
 * A file's bytes, a chunk at a time (`readInChunks`), so that neither a large stored file nor a
 * large backup has to fit in the app's Java heap at once. For a file in the app's own storage: a
 * handle on a `content://` URI loses its descriptor part-way through (see `pickBackup`).
 */
export function readFileBytes(file: File): Uint8Array {
  const handle = file.open(FileMode.ReadOnly);
  try {
    const size = handle.size;
    // A provider that streams without a size is read whole, as before, rather than as empty.
    if (!size) return file.bytesSync();
    return readInChunks(size, (length) => handle.readBytes(length));
  } finally {
    handle.close();
  }
}

/** A stored file's bytes, for a backup. Null when the file has gone missing. */
export async function readStoredFile(storedPath: string): Promise<Uint8Array | null> {
  const file = new File(absoluteUriFor(storedPath));
  return file.exists ? readFileBytes(file) : null;
}

/** Writes a restored file into the media directory, and nowhere else. */
export function writeStoredFile(storedPath: string, bytes: Uint8Array): void {
  if (!isStoredPath(storedPath)) throw new Error(`Refusing to write ${storedPath}`);
  ensureMediaDirectory();

  const file = new File(absoluteUriFor(storedPath));
  if (!file.exists) file.create();
  file.write(bytes);
}

/**
 * Removes a copy no row will ever point at — a receipt dropped from a form that was not saved.
 * Never for a file a row references. Best effort: the start-up sweep collects whatever this misses.
 */
export function deleteStoredFile(storedPath: string): void {
  if (!isStoredPath(storedPath)) return;
  try {
    const file = new File(absoluteUriFor(storedPath));
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Could not delete an unsaved copy', error);
  }
}

/**
 * Copies the picked file into the sandbox under a name derived from `id`.
 * Await it: the copy is asynchronous, and the row must not be written before the file lands.
 */
export async function importFile(
  id: string,
  sourceUri: string,
  source: { fileName?: string | null; mimeType?: string | null } = {},
): Promise<ImportedFile> {
  ensureMediaDirectory();

  const picked = new File(sourceUri);
  const fileName = source.fileName ?? picked.name ?? null;
  const mimeType = source.mimeType ?? picked.type ?? null;
  const storedPath = storedPathFor(id, { fileName, mimeType });

  const destination = new File(absoluteUriFor(storedPath));
  await picked.copy(destination);

  const size = destination.size;
  return { storedPath, fileName, mimeType, sizeBytes: destination.exists ? size : null };
}

/**
 * Hands the file to whatever app can display it. `contentUri` is a property on the modern
 * API — importing `getContentUriAsync` compiles but throws at runtime.
 */
export async function openStoredFile(resource: FileResource): Promise<void> {
  const file = new File(absoluteUriFor(resource.storedPath));
  if (!file.exists) throw new Error(`Missing file: ${resource.storedPath}`);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: (await viewerCopy(file, resource)).contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: file.type || resource.mimeType || 'application/octet-stream',
  });
}

/**
 * A copy in the cache named after the label, so the viewer's title bar reads "Boarding pass" rather
 * than the stored id. Falls back to the original if the copy fails — opening must not depend on it.
 */
async function viewerCopy(file: File, resource: FileResource): Promise<File> {
  try {
    const directory = new Directory(Paths.cache, 'open');
    if (!directory.exists) directory.create({ intermediates: true });
    const copy = new File(directory, viewerFileName(resource.label, resource.storedPath));
    if (copy.exists) copy.delete();
    await file.copy(copy);
    return copy;
  } catch (error) {
    console.warn('Opening the stored file directly', error);
    return file;
  }
}

/** Stored paths of everything actually sitting in the media directory. */
export function listStoredFiles(): string[] {
  const directory = new Directory(Paths.document, MEDIA_DIR);
  if (!directory.exists) return [];

  return directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => toStoredPath(Paths.document.uri, file.uri))
    .filter((path): path is string => path !== null);
}

/**
 * Deletes media no row points at. Call on app start with the paths the database still
 * references — never with a list that failed to load, or it would delete everything.
 */
export function sweepOrphanedFiles(referenced: readonly string[]): string[] {
  const orphans = orphanedStoredPaths(listStoredFiles(), referenced);

  for (const storedPath of orphans) {
    try {
      new File(absoluteUriFor(storedPath)).delete();
    } catch {
      // A file we cannot delete is not worth blocking start-up; the next sweep retries.
    }
  }
  return orphans;
}
