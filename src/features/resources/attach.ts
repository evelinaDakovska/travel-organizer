import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  defaultFileLabel,
  resourceInputSchema,
  type ResourceInput,
  type ResourceOwner,
} from '../../domain/resource';
import { importFile } from '../../files/storage';
import { createResource } from '../../repositories/resources';

/** How many of the picked files were saved, and how many could not be. */
export type AttachResult = { attached: number; failed: number };

/** What the user picks with. */
export type PickerKind = 'file' | 'photo' | 'camera';

type PickedFile = { uri: string; fileName: string | null; mimeType: string | null };

/** What an unnamed file is called. */
const FALLBACK_LABEL: Record<PickerKind, string> = {
  file: 'Document',
  photo: 'Photo',
  camera: 'Photo',
};

/**
 * Several at once — a booking often comes as a ticket per person. Not `File.pickFileAsync`: on
 * Android its `name` is the document id ('document:35'), so every attachment would be labelled
 * with it.
 */
async function pickDocuments(): Promise<PickedFile[]> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: false,
    multiple: true,
  });
  if (picked.canceled) return [];
  return picked.assets.map((asset) => ({
    uri: asset.uri,
    fileName: asset.name || null,
    mimeType: asset.mimeType ?? null,
  }));
}

/** Screenshots are a large share of real boarding passes, hence the photo picker. */
async function pickPhotos(): Promise<PickedFile[]> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
  });
  return picked.canceled ? [] : picked.assets.map(fromImageAsset);
}

/** A receipt photographed at the till (N5). */
async function takePhoto(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new CameraPermissionError();
  const taken = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  return taken.canceled ? [] : taken.assets.map(fromImageAsset);
}

/** Lets the screen say where to allow the camera, rather than that the file was bad. */
export class CameraPermissionError extends Error {
  constructor() {
    super('Camera permission was not given');
  }
}

const fromImageAsset = (asset: ImagePicker.ImagePickerAsset): PickedFile => ({
  uri: asset.uri,
  fileName: asset.fileName ?? null,
  mimeType: asset.mimeType ?? null,
});

const PICKERS: Record<PickerKind, () => Promise<PickedFile[]>> = {
  file: pickDocuments,
  photo: pickPhotos,
  camera: takePhoto,
};

/** Picks and attaches straight away. */
export async function attach(
  db: SQLiteDatabase,
  owner: ResourceOwner,
  kind: PickerKind,
): Promise<AttachResult> {
  const files = await PICKERS[kind]();
  return attachEach(db, owner, files, FALLBACK_LABEL[kind]);
}

/** One at a time, so a file that cannot be read does not cost the others. */
async function attachEach(
  db: SQLiteDatabase,
  owner: ResourceOwner,
  files: PickedFile[],
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
  await createResource(db, owner, await importAsInput(sourceUri, source, fallbackLabel));
}

/**
 * For a form whose owner does not exist until it is saved, such as a new expense's receipts:
 * copies each picked file into the app and describes it, but writes no row. A file that is never
 * saved is an orphan the next sweep collects.
 */
export async function pickAndImport(
  kind: PickerKind,
): Promise<{ inputs: ResourceInput[]; failed: number }> {
  const files = await PICKERS[kind]();
  const inputs: ResourceInput[] = [];
  let failed = 0;
  for (const file of files) {
    try {
      inputs.push(await importAsInput(file.uri, file, FALLBACK_LABEL[kind]));
    } catch (error) {
      console.warn('Attach failed', error);
      failed += 1;
    }
  }
  return { inputs, failed };
}

async function importAsInput(
  sourceUri: string,
  source: { fileName: string | null; mimeType: string | null },
  fallbackLabel: string,
): Promise<ResourceInput> {
  const imported = await importFile(randomUUID(), sourceUri, source);
  return resourceInputSchema.parse({
    kind: 'file',
    label: defaultFileLabel(imported.fileName, fallbackLabel),
    ...imported,
  });
}
