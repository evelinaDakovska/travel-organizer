import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_ITEM_MONEY_RECORDS,
  INSERT_TRIP_ITEM,
  SCHEDULE_TRIP_ITEM,
  SEARCH_TRIP_ITEMS,
  SEARCH_TRIP_NOTES,
  SELECT_BOOKINGS,
  SELECT_ITEMS_WITH_DEFAULT_TZ,
  SELECT_TRIP_ITEM_MOMENTS,
  SET_ITEM_INSTANTS,
  SELECT_KNOWN_PLACES,
  SELECT_PLACES,
  SELECT_REMINDER_CANDIDATES,
  SELECT_TRIP_ITEM,
  SELECT_TRIP_ITEMS,
  SET_TASK_COMPLETED,
  UPDATE_ITEM_INSTANTS,
  UPDATE_TRIP_ITEM,
  UPDATE_TRIP_ITEM_STATUS,
} from '../db/queries';
import {
  deleteRefusal,
  editRefusal,
  MoneyRuleError,
  type MoneyRecords,
} from '../domain/bookingPayments';
import { parseNoteRow, type Note, type NoteRow } from '../domain/note';
import type { KnownPlace } from '../domain/places';
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
import { writeItemParticipants } from './travellers';

/** Payments and linked expenses change an item's `recordedPaid` (3D-1), so they are watched too. */
export const TRIP_ITEM_TABLES = ['trip_items', 'booking_payments', 'expenses'] as const;

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

/** Place names written before, in any trip — this one first. */
export async function listKnownPlaces(db: SQLiteDatabase, tripId: string): Promise<KnownPlace[]> {
  return db.getAllAsync<KnownPlace>(SELECT_KNOWN_PLACES, { $tripId: tripId });
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

/**
 * One item and who takes part in it (C2), for a caller that already holds a transaction —
 * `createTripItem`, a journey's legs, a share. On its own it would not be atomic.
 */
export async function insertTripItem(
  db: SQLiteDatabase,
  tripId: string,
  input: TripItemInput,
  participants: readonly string[],
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_TRIP_ITEM, {
    $id: id,
    $tripId: tripId,
    $now: new Date().toISOString(),
    ...tripItemBindings(input, await tripDefaultTz(db, tripId)),
  });
  if (participants.length > 0) await writeItemParticipants(db, id, participants);
  return id;
}

/**
 * An item and its participants, both or neither. Not `withExclusiveTransactionAsync` — its second
 * connection is never heard by the change listener (CLAUDE.md, finding 6).
 */
export async function createTripItem(
  db: SQLiteDatabase,
  tripId: string,
  input: TripItemInput,
  participants: readonly string[] = [],
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await insertTripItem(db, tripId, input, participants);
  });
  return id;
}

/**
 * The legs of one journey (U7), all or none: a connection saved without the flight before it would
 * be worse than nothing. Every leg has the same participants.
 */
export async function createTripItems(
  db: SQLiteDatabase,
  tripId: string,
  inputs: readonly TripItemInput[],
  participants: readonly string[] = [],
): Promise<string[]> {
  const ids: string[] = [];
  await db.withTransactionAsync(async () => {
    for (const input of inputs) ids.push(await insertTripItem(db, tripId, input, participants));
  });
  return ids;
}

async function moneyRecords(db: SQLiteDatabase, itemId: string): Promise<MoneyRecords> {
  const row = await db.getFirstAsync<MoneyRecords>(COUNT_ITEM_MONEY_RECORDS, { $itemId: itemId });
  return { payments: row?.payments ?? 0, linkedExpenses: row?.linkedExpenses ?? 0 };
}

/** Refuses, with the reason, an edit that would strand the item's money records (3D-1). */
async function guardEdit(
  db: SQLiteDatabase,
  id: string,
  next: { status: TripItemStatus; priceAmount?: number | null; priceCurrency?: string | null },
): Promise<void> {
  const saved = await getTripItem(db, id);
  if (!saved) return;
  const refusal = editRefusal(saved, next, await moneyRecords(db, id));
  if (refusal) throw new MoneyRuleError(refusal);
}

/**
 * Saves an edit. `participants` replaces who takes part, in the same transaction; left out, they
 * are not touched. An edit that would strand payments is refused (`MoneyRuleError`).
 */
export async function updateTripItem(
  db: SQLiteDatabase,
  id: string,
  input: TripItemInput,
  participants?: readonly string[],
): Promise<void> {
  const defaultTz = await itemDefaultTz(db, id);
  await db.withTransactionAsync(async () => {
    await guardEdit(db, id, {
      status: input.status,
      priceAmount: input.priceAmount ?? null,
      priceCurrency: input.priceAmount === undefined ? null : (input.priceCurrency ?? null),
    });
    await db.runAsync(UPDATE_TRIP_ITEM, {
      $id: id,
      $now: new Date().toISOString(),
      ...tripItemBindings(input, defaultTz),
    });
    if (participants) await writeItemParticipants(db, id, participants);
  });
}

/**
 * Refused while payments or linked expenses point at it (L-1) — here with the reason, and by the
 * database's NO ACTION references whatever calls this. Never cascades money history away.
 */
export async function deleteTripItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const item = await getTripItem(db, id);
    const refusal = item ? deleteRefusal(item.title, await moneyRecords(db, id)) : null;
    if (refusal) throw new MoneyRuleError(refusal);
    await db.runAsync(`DELETE FROM trip_items WHERE id = ?`, id);
  });
}

/** Cancel or restore. Dates, notes and attachments are left as they were. */
export async function setTripItemStatus(
  db: SQLiteDatabase,
  id: string,
  status: TripItemStatus,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const saved = await getTripItem(db, id);
    if (saved) {
      await guardEdit(db, id, { status, priceAmount: saved.priceAmount, priceCurrency: saved.priceCurrency });
    }
    await db.runAsync(UPDATE_TRIP_ITEM_STATUS, {
      $id: id,
      $status: status,
      $now: new Date().toISOString(),
    });
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
  return rewriteInstants(db, tripId, SELECT_ITEMS_WITH_DEFAULT_TZ, true);
}

/**
 * Every item's instants rebuilt from its wall-clock time and zone — for a trip that arrived from
 * outside (2B), whose cached instants are not trusted. Same rule, same caller-owned transaction;
 * `updated_at` is left as exported — rebuilding a cache is not an edit.
 */
export async function rebuildAllTripInstants(db: SQLiteDatabase, tripId: string): Promise<number> {
  return rewriteInstants(db, tripId, SELECT_TRIP_ITEM_MOMENTS, false);
}

async function rewriteInstants(
  db: SQLiteDatabase,
  tripId: string,
  select: string,
  /** A zone change is an edit and stamps `updated_at`; rebuilding an import's caches is not. */
  stampUpdated: boolean,
): Promise<number> {
  const defaultTz = await tripDefaultTz(db, tripId);
  const rows = await db.getAllAsync<{
    id: string;
    start_local: string | null;
    start_precision: string | null;
    start_tz: string | null;
    end_local: string | null;
    end_precision: string | null;
    end_tz: string | null;
  }>(select, { $tripId: tripId });

  const now = new Date().toISOString();
  for (const row of rows) {
    const instants = {
      $id: row.id,
      $startUtc: instant(row.start_local, row.start_precision, row.start_tz, defaultTz),
      $endUtc: instant(row.end_local, row.end_precision, row.end_tz, defaultTz),
    };
    if (stampUpdated) await db.runAsync(UPDATE_ITEM_INSTANTS, { ...instants, $now: now });
    else await db.runAsync(SET_ITEM_INSTANTS, instants);
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
