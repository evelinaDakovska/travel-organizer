import type { SQLiteDatabase } from 'expo-sqlite';

import { insertRow, type ExportTableName } from '../db/queries';
import {
  parseImportHistory,
  withImport,
  type ImportRecord,
  type TripArchiveTables,
  type TripImportPlan,
} from '../domain/tripArchive';
import { getSetting } from './settings';
import { rebuildAllTripInstants } from './tripItems';

/** Parents before children, so every foreign key holds at each insert. */
const ORDER: readonly (readonly [keyof TripArchiveTables, ExportTableName])[] = [
  ['travellers', 'travellers'],
  ['trips', 'trips'],
  ['tripTravellers', 'trip_travellers'],
  ['tripItems', 'trip_items'],
  ['itemParticipants', 'item_participants'],
  ['tripNotes', 'trip_notes'],
  ['expenses', 'expenses'],
  ['payments', 'payments'],
  ['bookingPayments', 'booking_payments'],
  // After the members, plans and expenses they name.
  ['costShares', 'cost_shares'],
  ['tripCover', 'trip_cover'],
  ['resources', 'resources'],
  ['lists', 'lists'],
  ['listItems', 'list_items'],
  ['listItemRecipients', 'list_item_recipients'],
  ['templateUses', 'template_uses'],
];

type Row = Record<string, string | number | null>;
const bind = (row: Row) =>
  Object.fromEntries(Object.entries(row).map(([column, value]) => [`$${column}`, value]));

export async function importHistory(db: SQLiteDatabase): Promise<ImportRecord[]> {
  return parseImportHistory(await getSetting(db, 'trip_imports'));
}

/**
 * Writes a planned trip import in one transaction (2B): every row, the derived instants rebuilt
 * from the trip's own zone rather than trusted from the file, and the import recorded for spotting
 * a repeat. All of it lands, or none of it. Plain inserts of new ids only — nothing already on the
 * phone is updated, and a collision would fail the whole import rather than overwrite.
 *
 * Not `withExclusiveTransactionAsync`: its second connection is not heard by the change listener
 * (CLAUDE.md finding 6).
 */
export async function applyTripImport(
  db: SQLiteDatabase,
  plan: TripImportPlan,
  record: Omit<ImportRecord, 'tripId'>,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const [key, table] of ORDER) {
      for (const row of plan.tables[key] as unknown as Row[]) {
        await db.runAsync(insertRow(table), bind(row));
      }
    }
    await rebuildAllTripInstants(db, plan.tripId);
    const history = parseImportHistory(await getSetting(db, 'trip_imports'));
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('trip_imports', $value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      { $value: withImport(history, { ...record, tripId: plan.tripId }) },
    );
  });
}

export type ImportCheck = { ok: true } | { ok: false; problems: string[] };

/**
 * After the commit, the rows actually there for the new trip, against the plan. A mismatch is
 * reported, never "fixed" by deleting: the trip may still be the user's best copy.
 */
export async function verifyTripImport(
  db: SQLiteDatabase,
  plan: TripImportPlan,
): Promise<ImportCheck> {
  const count = async (sql: string) =>
    (await db.getFirstAsync<{ n: number }>(sql, { $trip: plan.tripId }))?.n ?? 0;
  const expected: [string, number, string][] = [
    ['trip', 1, `SELECT COUNT(*) AS n FROM trips WHERE id = $trip`],
    ['plans', plan.tables.tripItems.length, `SELECT COUNT(*) AS n FROM trip_items WHERE trip_id = $trip`],
    ['notes', plan.tables.tripNotes.length, `SELECT COUNT(*) AS n FROM trip_notes WHERE trip_id = $trip`],
    ['expenses', plan.tables.expenses.length, `SELECT COUNT(*) AS n FROM expenses WHERE trip_id = $trip`],
    ['payments', plan.tables.payments.length, `SELECT COUNT(*) AS n FROM payments WHERE trip_id = $trip`],
    [
      'booking payments',
      plan.tables.bookingPayments.length,
      `SELECT COUNT(*) AS n FROM booking_payments WHERE trip_id = $trip`,
    ],
    ['shares', plan.tables.costShares.length, `SELECT COUNT(*) AS n FROM cost_shares WHERE trip_id = $trip`],
    ['covers', plan.tables.tripCover.length, `SELECT COUNT(*) AS n FROM trip_cover WHERE trip_id = $trip`],
    [
      'documents',
      plan.tables.resources.length,
      `SELECT COUNT(*) AS n FROM resources
        WHERE trip_id = $trip OR trip_item_id IN (SELECT id FROM trip_items WHERE trip_id = $trip)`,
    ],
    ['travellers on the trip', plan.tables.tripTravellers.length, `SELECT COUNT(*) AS n FROM trip_travellers WHERE trip_id = $trip`],
    ['lists', plan.tables.lists.length, `SELECT COUNT(*) AS n FROM lists WHERE trip_id = $trip`],
    [
      'list items',
      plan.tables.listItems.length,
      `SELECT COUNT(*) AS n FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE trip_id = $trip)`,
    ],
    [
      'list recipients',
      plan.tables.listItemRecipients.length,
      `SELECT COUNT(*) AS n FROM list_item_recipients WHERE list_item_id IN
         (SELECT li.id FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.trip_id = $trip)`,
    ],
    [
      'participants',
      plan.tables.itemParticipants.length,
      `SELECT COUNT(*) AS n FROM item_participants WHERE item_id IN
         (SELECT id FROM trip_items WHERE trip_id = $trip)`,
    ],
  ];
  const problems: string[] = [];
  for (const [what, want, sql] of expected) {
    const got = await count(sql);
    if (got !== want) problems.push(`${what}: ${got} of ${want}`);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
