import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';

import { defaultFileLabel, resourceInputSchema, type ResourceOwner } from '../../domain/resource';
import { importFile } from '../../files/storage';
import { createResource } from '../../repositories/resources';

/** How many of the picked files were saved, and how many could not be. */
export type AttachResult = { attached: number; failed: number };

const NOTHING: AttachResult = { attached: 0, failed: 0 };

/**
 * Several at once — a booking often comes as a ticket per person. Not `File.pickFileAsync`: on
 * Android its `name` is the document id ('document:35'), so every attachment would be labelled
 * with it.
 */
export async function attachDocument(
  db: SQLiteDatabase,
  owner: ResourceOwner,
): Promise<AttachResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: false,
    multiple: true,
  });
  if (picked.canceled) return NOTHING;

  const files = picked.assets.map((asset) => ({
    uri: asset.uri,
    fileName: asset.name || null,
    mimeType: asset.mimeType ?? null,
  }));
  return attachEach(db, owner, files, 'Document');
}

/** Screenshots are a large share of real boarding passes, hence the photo picker. */
export async function attachPhoto(
  db: SQLiteDatabase,
  owner: ResourceOwner,
): Promise<AttachResult> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
  });
  if (picked.canceled) return NOTHING;

  const files = picked.assets.map((asset) => ({
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
  }));
  return attachEach(db, owner, files, 'Photo');
}

/** One at a time, so a file that cannot be read does not cost the others. */
async function attachEach(
  db: SQLiteDatabase,
  owner: ResourceOwner,
  files: { uri: string; fileName: string | null; mimeType: string | null }[],
  fallbackLabel: string,
): Promise<AttachResult> {
  let failed = 0;
  for (const file of files) {
    try {
      await attachFile(db, owner, file.uri, file, fallbackLabel);
    } catch (error) {
      console.warn('Attach failed', error);
      failed += 1;
    }
  }
  return { attached: files.length - failed, failed };
}

/**
 * The copy lands before the row is written. If the insert fails, the file is an orphan the next
 * sweep collects — never a row pointing at nothing.
 */
export async function attachFile(
  db: SQLiteDatabase,
  owner: ResourceOwner,
  sourceUri: string,
  source: { fileName: string | null; mimeType: string | null },
  fallbackLabel: string,
): Promise<void> {
  const imported = await importFile(randomUUID(), sourceUri, source);

  const input = resourceInputSchema.parse({
    kind: 'file',
    label: defaultFileLabel(imported.fileName, fallbackLabel),
    ...imported,
  });
  await createResource(db, owner, input);
}
