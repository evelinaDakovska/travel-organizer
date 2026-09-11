import type { SQLiteDatabase } from 'expo-sqlite';

import { DELETE_TRIP_FOR_REPLACE, insertRow, selectAll, upsertSetting } from '../db/queries';
import type {
  ExportTables,
  ImportPlan,
  NoteExportRow,
  ResourceExportRow,
  SettingExportRow,
  TripExportRow,
  TripItemExportRow,
} from '../domain/export';

export async function readAllTables(db: SQLiteDatabase): Promise<ExportTables> {
  const [trips, tripItems, tripNotes, resources, settings] = await Promise.all([
    db.getAllAsync<TripExportRow>(selectAll('trips')),
    db.getAllAsync<TripItemExportRow>(selectAll('trip_items')),
    db.getAllAsync<NoteExportRow>(selectAll('trip_notes')),
    db.getAllAsync<ResourceExportRow>(selectAll('resources')),
    db.getAllAsync<SettingExportRow>(selectAll('settings')),
  ]);
  return { trips, tripItems, tripNotes, resources, settings };
}

export async function listTripIds(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM trips`);
  return rows.map((row) => row.id);
}

type ExportRow = Record<string, string | number | null>;

/** Parameters are named after the columns, so a raw row binds as it stands. */
const bindRow = (row: ExportRow): Record<string, string | number | null> =>
  Object.fromEntries(Object.entries(row).map(([column, value]) => [`$${column}`, value]));

/**
 * Writes a planned import in one transaction: either the whole backup lands or none of it.
 * Parents go in before children so the foreign keys hold at every step.
 */
export async function applyImport(db: SQLiteDatabase, plan: ImportPlan): Promise<void> {
  const { write } = plan;

  await db.withExclusiveTransactionAsync(async (tx) => {
    if (plan.mode === 'replace') {
      for (const trip of write.trips) {
        await tx.runAsync(DELETE_TRIP_FOR_REPLACE, { $id: trip.id });
      }
    }

    for (const trip of write.trips) await tx.runAsync(insertRow('trips'), bindRow(trip));
    for (const item of write.tripItems) await tx.runAsync(insertRow('trip_items'), bindRow(item));
    for (const note of write.tripNotes) await tx.runAsync(insertRow('trip_notes'), bindRow(note));
    for (const resource of write.resources) {
      await tx.runAsync(insertRow('resources'), bindRow(resource));
    }
    for (const setting of write.settings) await tx.runAsync(upsertSetting, bindRow(setting));
  });
}
