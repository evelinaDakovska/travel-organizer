import type { Href } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';

import { noteInputSchema } from '../../domain/note';
import { linkResourceInput, linkFormSchema, type ResourceOwner } from '../../domain/resource';
import type { SharedContent } from '../../domain/share';
import type { Trip } from '../../domain/trip';
import { tripItemInputSchema, type Priority, type TripItemKind } from '../../domain/tripItem';
import { createNote } from '../../repositories/notes';
import { createResource } from '../../repositories/resources';
import { createTripItem } from '../../repositories/tripItems';
import { attachFile } from '../resources/attach';

export type ShareTarget =
  | {
      to: 'new-item';
      kind: TripItemKind;
      status: 'idea' | 'confirmed';
      priority: Priority | null;
      title: string;
    }
  | { to: 'item'; itemId: string }
  | { to: 'trip-documents' }
  | { to: 'note'; title: string };

/**
 * Writes the share where it was sent and says where to go to see it. Files are copied into the
 * sandbox before any row points at them — `attachFile` owns that order.
 */
export async function saveShare(
  db: SQLiteDatabase,
  trip: Trip,
  content: SharedContent,
  target: ShareTarget,
): Promise<Href> {
  if (target.to === 'note') {
    if (content.kind !== 'text') throw new Error('Only text becomes a note');
    const input = noteInputSchema.parse({
      title: target.title,
      body: content.text,
    });
    const noteId = await createNote(db, trip.id, input);
    return { pathname: '/note/[noteId]', params: { noteId } };
  }

  let owner: ResourceOwner;
  let href: Href;
  if (target.to === 'new-item') {
    const input = tripItemInputSchema(trip.defaultTz).parse({
      kind: target.kind,
      status: target.status,
      priority: target.status === 'idea' ? target.priority : null,
      title: target.title,
    });
    const itemId = await createTripItem(db, trip.id, input);
    owner = { scope: 'item', id: itemId };
    href = { pathname: '/item/[itemId]', params: { itemId } };
  } else if (target.to === 'item') {
    owner = { scope: 'item', id: target.itemId };
    href = { pathname: '/item/[itemId]', params: { itemId: target.itemId } };
  } else {
    owner = { scope: 'trip', id: trip.id };
    href = { pathname: '/trip/[tripId]', params: { tripId: trip.id } };
  }

  await attachContent(db, owner, content);
  return href;
}

async function attachContent(db: SQLiteDatabase, owner: ResourceOwner, content: SharedContent) {
  switch (content.kind) {
    case 'files':
      for (const file of content.files) {
        await attachFile(
          db,
          owner,
          file.uri,
          { fileName: file.fileName, mimeType: file.mimeType },
          'Shared file',
        );
      }
      return;
    case 'link': {
      const link = linkFormSchema.parse({
        url: content.url,
        label: content.title ?? undefined,
      });
      await createResource(db, owner, linkResourceInput(link));
      return;
    }
    case 'text':
      throw new Error('Text is saved as a note, not attached');
  }
}
