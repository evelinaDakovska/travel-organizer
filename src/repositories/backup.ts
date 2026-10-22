import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DELETE_TRIP_FOR_REPLACE,
  insertLinkRow,
  insertRow,
  MERGE_SETTING,
  REPLACE_SETTING,
  selectAll,
  upsertSharedRow,
  type ExportTableName,
} from '../db/queries';
import type { ExistingShared, ExportTables, ImportPlan } from '../domain/export';

/** Which database table each part of the backup is, in the order rows are written on import. */
const TABLES: readonly (readonly [keyof ExportTables, ExportTableName])[] = [
  // Travellers before anything that names one.
  ['travellers', 'travellers'],
  ['trips', 'trips'],
  ['tripTravellers', 'trip_travellers'],
  ['tripItems', 'trip_items'],
  ['itemParticipants', 'item_participants'],
  ['tripNotes', 'trip_notes'],
  // Before resources: a receipt names its expense.
  ['expenses', 'expenses'],
  ['payments', 'payments'],
  // After the bookings and the travellers they name.
  ['bookingPayments', 'booking_payments'],
  // After the members, bookings and expenses they name.
  ['costShares', 'cost_shares'],
  ['tripCover', 'trip_cover'],
  // After the members they name.
  ['settlements', 'settlements'],
  ['resources', 'resources'],
  ['lists', 'lists'],
  ['listItems', 'list_items'],
  // After their items and the travellers they name.
  ['listItemRecipients', 'list_item_recipients'],
  ['templates', 'templates'],
  ['templateUses', 'template_uses'],
  ['settings', 'settings'],
];

/** Rows that belong to no trip: kept or updated by id, never replaced along with a trip. */
const SHARED: ReadonlySet<keyof ExportTables> = new Set(['travellers', 'templates']);

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

/** Every table, read on the connection given; `readAllTables` gives it a snapshot. */
export async function readTables(db: SQLiteDatabase): Promise<ExportTables> {
  const rows = await Promise.all(
    TABLES.map(async ([key, table]) => [key, await db.getAllAsync(selectAll(table))] as const),
  );
  return Object.fromEntries(rows) as unknown as ExportTables;
}

export async function listTripIds(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM trips`);
  return rows.map((row) => row.id);
}

/** The rows on the phone that belong to no trip, so an import can tell what is missing. */
export async function listSharedIds(db: SQLiteDatabase): Promise<ExistingShared> {
  const ids = async (sql: string) =>
    (await db.getAllAsync<{ id: string }>(sql)).map((row) => row.id);
  const [travellers, lists, templates] = await Promise.all([
    ids(`SELECT id FROM travellers`),
    ids(`SELECT id FROM lists WHERE trip_id IS NULL`),
    ids(`SELECT id FROM templates`),
  ]);
  return { travellers, lists, templates };
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
  const { write, mode } = plan;

  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      // The cascade clears each trip's children, its travellers' places in it and its lists.
      for (const trip of write.trips) {
        await db.runAsync(DELETE_TRIP_FOR_REPLACE, { $id: trip.id });
      }
    }

    for (const [key, table] of TABLES) {
      for (const row of write[key] as ExportRow[]) {
        await db.runAsync(sqlFor(key, table, row, mode), bindRow(row));
      }
    }
  });
}

/** How one row is written: shared rows by id, settings by key, the rest as they come. */
function sqlFor(
  key: keyof ExportTables,
  table: ExportTableName,
  row: ExportRow,
  mode: ImportPlan['mode'],
): string {
  if (key === 'settings') return mode === 'replace' ? REPLACE_SETTING : MERGE_SETTING;
  if (SHARED.has(key)) return upsertSharedRow(table, mode);
  // A reusable list and its items belong to no trip either.
  if (key === 'lists' && row.trip_id === null) return upsertSharedRow(table, mode);
  if (key === 'listItems') return upsertSharedRow(table, mode);
  if (key === 'listItemRecipients') return insertLinkRow(table);
  return insertRow(table);
}
