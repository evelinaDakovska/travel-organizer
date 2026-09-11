/**
 * Everything touching the filesystem. Files are copied in on import and never referenced
 * by their original URI — Android grants only temporary permission on those.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

import {
  MEDIA_DIR,
  orphanedStoredPaths,
  storedPathFor,
  toAbsoluteUri,
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
    data: file.contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: file.type || resource.mimeType || 'application/octet-stream',
  });
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
