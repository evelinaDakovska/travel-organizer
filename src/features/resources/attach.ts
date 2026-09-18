import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';

import { defaultFileLabel, resourceInputSchema, type ResourceOwner } from '../../domain/resource';
import { importFile } from '../../files/storage';
import { createResource } from '../../repositories/resources';

/**
 * Resolves false when the user backs out. Not `File.pickFileAsync`: on Android its `name` is the
 * document id ('document:35'), so every attachment would be labelled with it.
 */
export async function attachDocument(db: SQLiteDatabase, owner: ResourceOwner): Promise<boolean> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false });
  if (picked.canceled) return false;

  const asset = picked.assets[0];
  await attachFile(db, owner, asset.uri, {
    fileName: asset.name || null,
    mimeType: asset.mimeType ?? null,
  }, 'Document');
  return true;
}

/** Screenshots are a large share of real boarding passes, hence the photo picker. */
export async function attachPhoto(db: SQLiteDatabase, owner: ResourceOwner): Promise<boolean> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled) return false;

  const asset = picked.assets[0];
  await attachFile(db, owner, asset.uri, {
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
  }, 'Photo');
  return true;
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
