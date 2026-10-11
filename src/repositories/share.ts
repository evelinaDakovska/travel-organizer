import type { SQLiteDatabase } from 'expo-sqlite';

import type { ResourceInput, ResourceOwner } from '../domain/resource';
import type { TripItemInput } from '../domain/tripItem';
import { createResource } from './resources';
import { createTripItem } from './tripItems';

/** Where a share's rows go: a new item made from it, or something that already exists. */
export type ShareRowsTarget =
  | { to: 'new-item'; tripId: string; input: TripItemInput }
  | { to: 'existing'; owner: ResourceOwner };

/**
 * The item (if new) and every attachment row, all or none (R5): a failed row never leaves an item
 * without the files it was made for. The files are already copied in; on a throw the caller deletes
 * them. Not `withExclusiveTransactionAsync` (CLAUDE.md, finding 6). Returns who owns the rows.
 */
export async function saveSharedRows(
  db: SQLiteDatabase,
  target: ShareRowsTarget,
  resources: readonly ResourceInput[],
): Promise<ResourceOwner> {
  let owner: ResourceOwner | null = target.to === 'existing' ? target.owner : null;
  await db.withTransactionAsync(async () => {
    if (target.to === 'new-item') {
      owner = { scope: 'item', id: await createTripItem(db, target.tripId, target.input) };
    }
    for (const resource of resources) await createResource(db, owner!, resource);
  });
  return owner!;
}
