import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COPY_RESOURCE_TO_ITEM,
  COUNT_ITEM_OWN_FILES,
  COUNT_OTHER_FILE_REFERENCES,
  INSERT_RESOURCE,
  SELECT_ALL_STORED_PATHS,
  SELECT_ITEM_RESOURCES_FOR_TRIP,
  SELECT_ITEMS_SHARING_RESOURCE,
  SELECT_RESOURCE,
  SELECT_RESOURCES_FOR_ITEM,
  SELECT_RESOURCES_FOR_TRIP,
  SELECT_RESOURCE_TRIP_ID,
  SELECT_TRIP_STORED_PATHS,
  UPDATE_RESOURCE_LABEL,
} from '../db/queries';
import {
  parseResourceRow,
  type Resource,
  type ResourceInput,
  type ResourceOwner,
  type ResourceRow,
} from '../domain/resource';

export const RESOURCE_TABLES = ['resources'] as const;

/** The trip-wide attachment query joins items, so it must refresh when either table changes. */
export const ITEM_RESOURCE_TABLES = ['resources', 'trip_items'] as const;

export async function listResources(
  db: SQLiteDatabase,
  owner: ResourceOwner,
): Promise<Resource[]> {
  const sql = owner.scope === 'item' ? SELECT_RESOURCES_FOR_ITEM : SELECT_RESOURCES_FOR_TRIP;
  const rows = await db.getAllAsync<ResourceRow>(sql, { $id: owner.id });
  return rows.map(parseResourceRow);
}

export async function getResource(db: SQLiteDatabase, id: string): Promise<Resource | null> {
  const row = await db.getFirstAsync<ResourceRow>(SELECT_RESOURCE, { $id: id });
  return row ? parseResourceRow(row) : null;
}

/** One query for every card on a tab, rather than one per card. */
export async function listItemResourcesForTrip(
  db: SQLiteDatabase,
  tripId: string,
): Promise<Resource[]> {
  const rows = await db.getAllAsync<ResourceRow>(SELECT_ITEM_RESOURCES_FOR_TRIP, {
    $tripId: tripId,
  });
  return rows.map(parseResourceRow);
}

export async function createResource(
  db: SQLiteDatabase,
  owner: ResourceOwner,
  input: ResourceInput,
): Promise<string> {
  const id = randomUUID();
  const isFile = input.kind === 'file';

  await db.runAsync(INSERT_RESOURCE, {
    $id: id,
    $tripId: owner.scope === 'trip' ? owner.id : null,
    $tripItemId: owner.scope === 'item' ? owner.id : null,
    $kind: input.kind,
    $subtype: input.subtype,
    $label: input.label,
    $url: isFile ? null : input.url,
    $storedPath: isFile ? input.storedPath : null,
    $fileName: isFile ? (input.fileName ?? null) : null,
    $mimeType: isFile ? (input.mimeType ?? null) : null,
    $sizeBytes: isFile ? (input.sizeBytes ?? null) : null,
    $now: new Date().toISOString(),
  });
  return id;
}

export async function renameResource(
  db: SQLiteDatabase,
  id: string,
  label: string,
  subtype: Resource['subtype'],
): Promise<void> {
  await db.runAsync(UPDATE_RESOURCE_LABEL, { $id: id, $label: label, $subtype: subtype });
}

/** The file on disk is left for the sweep, so a crash between the two cannot strand a row. */
export async function deleteResource(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM resources WHERE id = ?`, id);
}

export async function listAllStoredPaths(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ stored_path: string }>(SELECT_ALL_STORED_PATHS);
  return rows.map((r) => r.stored_path);
}

export async function listTripStoredPaths(db: SQLiteDatabase, tripId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ stored_path: string }>(SELECT_TRIP_STORED_PATHS, {
    $tripId: tripId,
  });
  return rows.map((r) => r.stored_path);
}

/** The same file or link, attached to an item as well. One file on disk, two rows. */
export async function attachResourceToItem(
  db: SQLiteDatabase,
  sourceId: string,
  itemId: string,
): Promise<void> {
  await db.runAsync(COPY_RESOURCE_TO_ITEM, {
    $id: randomUUID(),
    $itemId: itemId,
    $sourceId: sourceId,
    $now: new Date().toISOString(),
  });
}

export async function resourceTripId(db: SQLiteDatabase, id: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ trip_id: string | null }>(SELECT_RESOURCE_TRIP_ID, {
    $id: id,
  });
  return row?.trip_id ?? null;
}

/** Items that already hold this file or link. */
export async function itemsSharingResource(db: SQLiteDatabase, id: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ item_id: string }>(SELECT_ITEMS_SHARING_RESOURCE, {
    $id: id,
  });
  return rows.map((row) => row.item_id);
}

/** How many other places hold this attachment's file — removing it here then keeps the file. */
export async function countOtherFileReferences(db: SQLiteDatabase, id: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(COUNT_OTHER_FILE_REFERENCES, { $id: id });
  return row?.n ?? 0;
}

/** Files deleting this item would really remove, leaving out ones also attached elsewhere. */
export async function countItemOwnFiles(db: SQLiteDatabase, itemId: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(COUNT_ITEM_OWN_FILES, { $id: itemId });
  return row?.n ?? 0;
}
