/**
 * The phone side of the activities format (2C): picking a file and reading it as text, and writing
 * an export or the schema to the cache for the share sheet. Every rule lives in
 * `domain/activityFormat`; this file only moves text.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ACTIVITY_LIMITS } from '../domain/activityFormat';
import schema from '../domain/activityFormat.schema.json';

export type PickedActivityFile =
  | { ok: true; name: string; text: string }
  | { ok: false; reason: string };

/**
 * Null when the picker is dismissed. The size is checked before a byte is read, and the picker's
 * copy in the cache is deleted afterwards. Any type is offered: Android often labels a .json file
 * as plain text or as unknown, and the content is checked anyway.
 */
export async function pickActivityFile(): Promise<PickedActivityFile | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  const copy = new File(asset.uri);
  try {
    if (copy.size > ACTIVITY_LIMITS.fileBytes) {
      return { ok: false, reason: 'This file is larger than 1 MB, too large for an activities file.' };
    }
    return { ok: true, name: asset.name, text: await copy.text() };
  } finally {
    if (copy.exists) copy.delete();
  }
}

async function shareText(
  name: string,
  text: string,
  dialogTitle: string,
  mimeType = 'application/json',
): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

/** The calendar file (Phase 8): text/calendar, so calendar apps offer to open it. */
export async function shareCalendarFile(name: string, text: string): Promise<void> {
  await shareText(name, text, 'Add to calendar', 'text/calendar');
}

export async function shareActivityFile(name: string, document: unknown): Promise<void> {
  await shareText(name, `${JSON.stringify(document, null, 2)}\n`, 'Share activities');
}

export async function shareActivitySchema(): Promise<void> {
  await shareText(
    'travel-organizer-activities-v1.schema.json',
    `${JSON.stringify(schema, null, 2)}\n`,
    'Share the activities format',
  );
}
