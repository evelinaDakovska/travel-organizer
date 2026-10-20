import type { SQLiteDatabase } from 'expo-sqlite';

import type { ActivityLink, ExportLink } from '../domain/activityFormat';
import type { TripItemInput } from '../domain/tripItem';
import { createResource, listItemResourcesForTrip } from './resources';
import { insertTripItem } from './tripItems';

export type ActivityEntry = { input: TripItemInput; links: readonly ActivityLink[] };

/**
 * Adds the chosen activities (2C) to one trip: every item and its links in **one** transaction,
 * so a failure anywhere leaves none of them. Add-only — nothing already in the database is
 * updated or deleted — and every id is made here. Not `withExclusiveTransactionAsync`: its second
 * connection is never heard by the change listener (CLAUDE.md, finding 6).
 */
export async function importActivities(
  db: SQLiteDatabase,
  tripId: string,
  entries: readonly ActivityEntry[],
): Promise<string[]> {
  const ids: string[] = [];
  await db.withTransactionAsync(async () => {
    const trip = await db.getFirstAsync<{ id: string }>(`SELECT id FROM trips WHERE id = ?`, tripId);
    if (!trip) throw new Error(`No trip ${tripId}`);
    for (const { input, links } of entries) {
      const id = await insertTripItem(db, tripId, input, []);
      for (const link of links) {
        await createResource(
          db,
          { scope: 'item', id },
          { kind: 'link', subtype: link.subtype, label: link.label, url: link.url },
        );
      }
      ids.push(id);
    }
  });
  return ids;
}

/** Each item's links, for the export — files are never read. */
export async function listItemLinks(
  db: SQLiteDatabase,
  tripId: string,
): Promise<Map<string, ExportLink[]>> {
  const byItem = new Map<string, ExportLink[]>();
  for (const resource of await listItemResourcesForTrip(db, tripId)) {
    if (resource.kind !== 'link' || resource.owner.scope !== 'item') continue;
    const list = byItem.get(resource.owner.id) ?? [];
    list.push({ label: resource.label, url: resource.url, subtype: resource.subtype });
    byItem.set(resource.owner.id, list);
  }
  return byItem;
}
