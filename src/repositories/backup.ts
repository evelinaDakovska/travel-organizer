import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_TRIP_FOR_REPLACE,
  insertRow,
  MERGE_SETTING,
  REPLACE_SETTING,
  selectAll,
} from '../db/queries';
import type {
  ExpenseExportRow,
  ExportTables,
  ImportPlan,
  NoteExportRow,
  PaymentExportRow,
  ResourceExportRow,
  SettingExportRow,
  TripExportRow,
  TripItemExportRow,
} from '../domain/export';

/**
 * Every table as of one moment (A4). The reads share one transaction on a connection of its own,
 * which in WAL mode is a snapshot: a write landing mid-export — a task ticked, a reminder
 * reconciled — cannot leave an item in the backup without its trip, or the other way round. Only
 * reads, so it never takes the write lock, and there is nothing for the change listener to miss.
 */
export async function readAllTables(db: SQLiteDatabase): Promise<ExportTables> {
  let tables: ExportTables | undefined;
  await db.withExclusiveTransactionAsync(async (snapshot) => {
    tables = await readTables(snapshot);
  });
  return tables!;
}

async function readTables(db: SQLiteDatabase): Promise<ExportTables> {
  const [trips, tripItems, tripNotes, expenses, payments, resources, settings] = await Promise.all([
    db.getAllAsync<TripExportRow>(selectAll('trips')),
    db.getAllAsync<TripItemExportRow>(selectAll('trip_items')),
    db.getAllAsync<NoteExportRow>(selectAll('trip_notes')),
    db.getAllAsync<ExpenseExportRow>(selectAll('expenses')),
    db.getAllAsync<PaymentExportRow>(selectAll('payments')),
    db.getAllAsync<ResourceExportRow>(selectAll('resources')),
    db.getAllAsync<SettingExportRow>(selectAll('settings')),
  ]);
  return { trips, tripItems, tripNotes, expenses, payments, resources, settings };
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
 *
 * Not `withExclusiveTransactionAsync`: that opens a second connection, whose writes the change
 * listener never hears, so every open screen kept showing the phone as it was before the import.
 */
export async function applyImport(db: SQLiteDatabase, plan: ImportPlan): Promise<void> {
  const { write } = plan;

  await db.withTransactionAsync(async () => {
    if (plan.mode === 'replace') {
      for (const trip of write.trips) {
        await db.runAsync(DELETE_TRIP_FOR_REPLACE, { $id: trip.id });
      }
    }

    for (const trip of write.trips) await db.runAsync(insertRow('trips'), bindRow(trip));
    for (const item of write.tripItems) await db.runAsync(insertRow('trip_items'), bindRow(item));
    for (const note of write.tripNotes) await db.runAsync(insertRow('trip_notes'), bindRow(note));
    // Before resources: a receipt names its expense.
    for (const expense of write.expenses) {
      await db.runAsync(insertRow('expenses'), bindRow(expense));
    }
    for (const payment of write.payments) {
      await db.runAsync(insertRow('payments'), bindRow(payment));
    }
    for (const resource of write.resources) {
      await db.runAsync(insertRow('resources'), bindRow(resource));
    }
    const settingSql = plan.mode === 'replace' ? REPLACE_SETTING : MERGE_SETTING;
    for (const setting of write.settings) await db.runAsync(settingSql, bindRow(setting));
  });
}
