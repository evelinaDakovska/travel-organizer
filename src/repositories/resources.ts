import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  INSERT_RESOURCE,
  SELECT_ALL_STORED_PATHS,
  SELECT_RESOURCE,
  SELECT_RESOURCES_FOR_ITEM,
  SELECT_RESOURCES_FOR_TRIP,
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
