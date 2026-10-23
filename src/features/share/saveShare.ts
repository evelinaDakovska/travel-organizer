import type { Href } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';

import { noteInputSchema } from '../../domain/note';
import {
  linkFormSchema,
  linkResourceInput,
  type ResourceInput,
  type ResourceOwner,
} from '../../domain/resource';
import { shareOutcomeMessage, type ShareOutcome, type SharedContent } from '../../domain/share';
import type { Trip } from '../../domain/trip';
import { tripItemInputSchema, type Priority, type TripItemKind } from '../../domain/tripItem';
import { deleteStoredFile } from '../../files/storage';
import { createNote } from '../../repositories/notes';
import { saveSharedRows, type ShareRowsTarget } from '../../repositories/share';
import { importAsInput } from '../resources/attach';

export type ShareTarget =
  | {
      to: 'new-item';
      kind: TripItemKind;
      status: 'idea' | 'confirmed';
      priority: Priority | null;
      title: string;
      /** Read from a Google Maps link and checked by the person (Phase 7); absent for other shares. */
      place?: { locationName?: string; address?: string; latitude?: number; longitude?: number };
    }
  | { to: 'item'; itemId: string; itemTitle: string }
  | { to: 'trip-documents' }
  | { to: 'note'; title: string };

/**
 * Where to go once saved, or null when nothing was; and what to tell the user first, or null when
 * everything went in.
 */
export type ShareResult = {
  href: Href | null;
  message: { title: string; body: string } | null;
};

/**
 * Writes the share where it was sent (R5, D27). Files are copied in one by one and a file that
 * cannot be read does not cost the others; then the item (if new) and every row are written in one
 * transaction. If that write fails, the copies are deleted and it throws: nothing was saved. If no
 * file could be copied, nothing is written at all.
 */
export async function saveShare(
  db: SQLiteDatabase,
  trip: Trip,
  content: SharedContent,
  target: ShareTarget,
): Promise<ShareResult> {
  if (target.to === 'note') {
    if (content.kind !== 'text') throw new Error('Only text becomes a note');
    const input = noteInputSchema.parse({ title: target.title, body: content.text });
    const noteId = await createNote(db, trip.id, input);
    return { href: { pathname: '/note/[noteId]', params: { noteId } }, message: null };
  }
  if (content.kind === 'text') throw new Error('Text is saved as a note, not attached');

  const retryInto: ShareOutcome['retryInto'] =
    target.to === 'trip-documents'
      ? { destination: 'trip-documents' }
      : { destination: 'item', itemTitle: target.to === 'item' ? target.itemTitle : target.title };

  const resources: ResourceInput[] = [];
  const failed: (string | null)[] = [];
  if (content.kind === 'files') {
    for (const file of content.files) {
      try {
        const source = { fileName: file.fileName, mimeType: file.mimeType };
        resources.push(await importAsInput(file.uri, source, 'Shared file'));
      } catch (error) {
        console.warn('Copying a shared file failed', error);
        failed.push(file.fileName);
      }
    }
    if (resources.length === 0) {
      return { href: null, message: shareOutcomeMessage({ saved: 0, failed, retryInto }) };
    }
  } else {
    const link = linkFormSchema.parse({ url: content.url, label: content.title ?? undefined });
    resources.push(linkResourceInput(link));
  }

  const rowsTarget: ShareRowsTarget =
    target.to === 'new-item'
      ? {
          to: 'new-item',
          tripId: trip.id,
          input: tripItemInputSchema(trip.defaultTz).parse({
            kind: target.kind,
            status: target.status,
            priority: target.status === 'idea' ? target.priority : null,
            title: target.title,
            ...target.place,
          }),
        }
      : {
          to: 'existing',
          owner:
            target.to === 'item'
              ? { scope: 'item', id: target.itemId }
              : { scope: 'trip', id: trip.id },
        };

  let owner: ResourceOwner;
  try {
    owner = await saveSharedRows(db, rowsTarget, resources);
  } catch (error) {
    // No row points at these copies; delete them now rather than wait for the start-up sweep.
    for (const resource of resources) {
      if (resource.kind === 'file') deleteStoredFile(resource.storedPath);
    }
    throw error;
  }

  const href: Href =
    owner.scope === 'item'
      ? { pathname: '/item/[itemId]', params: { itemId: owner.id } }
      : { pathname: '/trip/[tripId]', params: { tripId: trip.id } };
  return { href, message: shareOutcomeMessage({ saved: resources.length, failed, retryInto }) };
}
