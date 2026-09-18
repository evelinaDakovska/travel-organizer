import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  INSERT_TRIP_ITEM,
  SCHEDULE_TRIP_ITEM,
  SEARCH_TRIP_ITEMS,
  SEARCH_TRIP_NOTES,
  SELECT_BOOKINGS,
  SELECT_ITEMS_WITH_DEFAULT_TZ,
  SELECT_PLACES,
  SELECT_REMINDER_CANDIDATES,
  SELECT_TRIP_ITEM,
  SELECT_TRIP_ITEMS,
  SET_TASK_COMPLETED,
  UPDATE_ITEM_INSTANTS,
  UPDATE_TRIP_ITEM,
  UPDATE_TRIP_ITEM_STATUS,
} from '../db/queries';
import { parseNoteRow, type Note, type NoteRow } from '../domain/note';
import { searchPattern } from '../domain/search';
import { localPrecision, toInstant, type LocalMoment, type TimePrecision } from '../domain/time';
import {
  parseTripItemRow,
  tripItemBindings,
  type TripItem,
  type TripItemInput,
  type TripItemRow,
  type TripItemStatus,
} from '../domain/tripItem';

export const TRIP_ITEM_TABLES = ['trip_items'] as const;

type JoinedRow = TripItemRow & { trip_default_tz: string };

export async function listTripItems(db: SQLiteDatabase, tripId: string): Promise<TripItem[]> {
  const rows = await db.getAllAsync<JoinedRow>(SELECT_TRIP_ITEMS, { $tripId: tripId });
  return rows.map((row) => parseTripItemRow(row, row.trip_default_tz));
}

/** Bookings tab: what is settled. */
export async function listBookings(db: SQLiteDatabase, tripId: string): Promise<TripItem[]> {
  const rows = await db.getAllAsync<JoinedRow>(SELECT_BOOKINGS, { $tripId: tripId });
  return rows.map((row) => parseTripItemRow(row, row.trip_default_tz));
}

/** Places tab: what is still only an idea, most wanted first. */
export async function listPlaces(db: SQLiteDatabase, tripId: string): Promise<TripItem[]> {
  const rows = await db.getAllAsync<JoinedRow>(SELECT_PLACES, { $tripId: tripId });
  return rows.map((row) => parseTripItemRow(row, row.trip_default_tz));
}

export async function getTripItem(db: SQLiteDatabase, id: string): Promise<TripItem | null> {
  const row = await db.getFirstAsync<JoinedRow>(SELECT_TRIP_ITEM, { $id: id });
  return row ? parseTripItemRow(row, row.trip_default_tz) : null;
}

/** Items that may still need a reminder, across all trips. `domain/reminders` decides the rest. */
export async function listReminderCandidates(db: SQLiteDatabase, now: Date): Promise<TripItem[]> {
  const rows = await db.getAllAsync<JoinedRow>(SELECT_REMINDER_CANDIDATES, {
    $now: now.toISOString(),
  });
  return rows.map((row) => parseTripItemRow(row, row.trip_default_tz));
}

export async function createTripItem(
  db: SQLiteDatabase,
  tripId: string,
  input: TripItemInput,
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_TRIP_ITEM, {
    $id: id,
    $tripId: tripId,
    $now: new Date().toISOString(),
    ...tripItemBindings(input, await tripDefaultTz(db, tripId)),
  });
  return id;
}

export async function updateTripItem(
  db: SQLiteDatabase,
  id: string,
  input: TripItemInput,
): Promise<void> {
  await db.runAsync(UPDATE_TRIP_ITEM, {
    $id: id,
    $now: new Date().toISOString(),
    ...tripItemBindings(input, await itemDefaultTz(db, id)),
  });
}

export async function deleteTripItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM trip_items WHERE id = ?`, id);
}

/** Cancel or restore. Dates, notes and attachments are left as they were. */
export async function setTripItemStatus(
  db: SQLiteDatabase,
  id: string,
  status: TripItemStatus,
): Promise<void> {
  await db.runAsync(UPDATE_TRIP_ITEM_STATUS, {
    $id: id,
    $status: status,
    $now: new Date().toISOString(),
  });
}

export async function setTaskCompleted(
  db: SQLiteDatabase,
  id: string,
  completed: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(SET_TASK_COMPLETED, {
    $id: id,
    $completedAt: completed ? now : null,
    $now: now,
  });
}

/**
 * Changing a trip's default zone changes what every unqualified moment means, so the cached
 * instants derived from it must be rebuilt. **The caller owns the transaction** — SQLite does
 * not nest them, and this has to commit together with the zone change that caused it.
 */
export async function recomputeTripInstants(db: SQLiteDatabase, tripId: string): Promise<number> {
  const defaultTz = await tripDefaultTz(db, tripId);
  const rows = await db.getAllAsync<{
    id: string;
    start_local: string | null;
    start_precision: string | null;
    start_tz: string | null;
    end_local: string | null;
    end_precision: string | null;
    end_tz: string | null;
  }>(SELECT_ITEMS_WITH_DEFAULT_TZ, { $tripId: tripId });

  const now = new Date().toISOString();
  for (const row of rows) {
    await db.runAsync(UPDATE_ITEM_INSTANTS, {
      $id: row.id,
      $startUtc: instant(row.start_local, row.start_precision, row.start_tz, defaultTz),
      $endUtc: instant(row.end_local, row.end_precision, row.end_tz, defaultTz),
      $now: now,
    });
  }
  return rows.length;
}

function instant(
  local: string | null,
  precision: string | null,
  tz: string | null,
  defaultTz: string,
): string | null {
  if (local === null || precision === null) return null;
  return toInstant({ local, tz: tz ?? defaultTz, precision: precision as TimePrecision });
}

async function tripDefaultTz(db: SQLiteDatabase, tripId: string): Promise<string> {
  const row = await db.getFirstAsync<{ default_tz: string }>(
    `SELECT default_tz FROM trips WHERE id = ?`,
    tripId,
  );
  if (!row) throw new Error(`No trip ${tripId}`);
  return row.default_tz;
}

async function itemDefaultTz(db: SQLiteDatabase, itemId: string): Promise<string> {
  const row = await db.getFirstAsync<{ default_tz: string }>(
    `SELECT t.default_tz FROM trip_items i JOIN trips t ON t.id = i.trip_id WHERE i.id = ?`,
    itemId,
  );
  if (!row) throw new Error(`No trip item ${itemId}`);
  return row.default_tz;
}

/**
 * Promotes a saved place to something on the timeline. One UPDATE: the row keeps its
 * identity, its resources and its notes, so nothing has to be copied anywhere.
 */
export async function scheduleTripItem(
  db: SQLiteDatabase,
  id: string,
  moment: { local: string; tz?: string | null } | null,
  status: 'idea' | 'confirmed' = 'confirmed',
): Promise<void> {
  const defaultTz = await itemDefaultTz(db, id);
  const precision = moment ? localPrecision(moment.local) : null;
  if (moment && precision === null) throw new Error(`Invalid date: ${moment.local}`);

  const resolved: LocalMoment | null =
    moment && precision ? { local: moment.local, tz: moment.tz ?? defaultTz, precision } : null;

  await db.runAsync(SCHEDULE_TRIP_ITEM, {
    $id: id,
    $startLocal: moment?.local ?? null,
    $startTz: moment?.tz ?? null,
    $startPrecision: precision,
    $startUtc: resolved ? toInstant(resolved) : null,
    $status: status,
    $now: new Date().toISOString(),
  });
}

export type TripSearchResults = { items: TripItem[]; notes: Note[] };

/** Blank query returns nothing rather than the whole trip. */
export async function searchTrip(
  db: SQLiteDatabase,
  tripId: string,
  query: string,
): Promise<TripSearchResults> {
  const pattern = searchPattern(query);
  if (pattern === null) return { items: [], notes: [] };

  const params = { $tripId: tripId, $q: pattern };
  const [items, notes] = await Promise.all([
    db.getAllAsync<JoinedRow>(SEARCH_TRIP_ITEMS, params),
    db.getAllAsync<NoteRow>(SEARCH_TRIP_NOTES, params),
  ]);

  return {
    items: items.map((row) => parseTripItemRow(row, row.trip_default_tz)),
    notes: notes.map(parseNoteRow),
  };
}
