import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { COUNT_TRIP_CONTENTS } from '../db/queries';
import { MoneyRuleError } from '../domain/bookingPayments';
import { parseTripRow, type Trip, type TripInput, type TripRow } from '../domain/trip';
import { recomputeTripInstants } from './tripItems';
import { addTripTraveller, leaveTrip, leaveTripRefusal, listTripTravellers } from './travellers';

export const TRIP_TABLES = ['trips', 'trip_travellers'] as const;

const SELECT = `SELECT * FROM trips`;

export async function listTrips(db: SQLiteDatabase): Promise<Trip[]> {
  const rows = await db.getAllAsync<TripRow>(`${SELECT} ORDER BY start_date ASC`);
  return rows.map(parseTripRow);
}

export async function getTrip(db: SQLiteDatabase, id: string): Promise<Trip | null> {
  const row = await db.getFirstAsync<TripRow>(`${SELECT} WHERE id = ?`, id);
  return row ? parseTripRow(row) : null;
}

export async function createTrip(db: SQLiteDatabase, input: TripInput): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO trips
       (id, name, destination, start_date, end_date, default_tz, notes,
        traveller_count, travellers, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name,
    input.destination ?? null,
    input.startDate,
    input.endDate,
    input.defaultTz,
    input.notes ?? null,
    input.travellerCount ?? null,
    serialiseTravellers(input.travellers),
    now,
    now,
  );
  return id;
}

/** Creates a trip and links selected traveller profile memberships atomically. */
export async function createTripWithMembers(
  db: SQLiteDatabase,
  input: TripInput,
  travellerIds: readonly string[] = [],
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await createTrip(db, input);
    for (const travellerId of travellerIds) {
      await addTripTraveller(db, id, travellerId);
    }
  });
  return id;
}

export async function updateTrip(
  db: SQLiteDatabase,
  id: string,
  input: TripInput,
): Promise<void> {
  // One transaction: items whose instants were derived from the old zone must not survive
  // a crash between the two writes, because nothing would recompute them later.
  await db.withTransactionAsync(() => writeTrip(db, id, input));
}

/** The trip's fields and, on a new zone, its items' instants. Inside the caller's transaction. */
async function writeTrip(db: SQLiteDatabase, id: string, input: TripInput): Promise<void> {
  const previous = await db.getFirstAsync<{ default_tz: string }>(
    `SELECT default_tz FROM trips WHERE id = ?`,
    id,
  );
  const zoneChanged = previous !== null && previous.default_tz !== input.defaultTz;

  await db.runAsync(
    `UPDATE trips SET
       name = ?, destination = ?, start_date = ?, end_date = ?, default_tz = ?,
       notes = ?, traveller_count = ?, travellers = ?, updated_at = ?
     WHERE id = ?`,
    input.name,
    input.destination ?? null,
    input.startDate,
    input.endDate,
    input.defaultTz,
    input.notes ?? null,
    input.travellerCount ?? null,
    serialiseTravellers(input.travellers),
    new Date().toISOString(),
    id,
  );

  if (zoneChanged) await recomputeTripInstants(db, id);
}

/**
 * Updates trip fields and synchronises traveller memberships preserving classification overrides.
 * One transaction for the whole save: a refusal or a failed write part-way leaves the trip, its
 * members and their participation exactly as they were.
 */
export async function updateTripWithMembers(
  db: SQLiteDatabase,
  tripId: string,
  input: TripInput,
  newTravellerIds: readonly string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const currentMembers = await listTripTravellers(db, tripId);
    const newIdSet = new Set(newTravellerIds);

    // Nobody who paid on this trip can be unticked: refused before anything is written (3D-1).
    for (const member of currentMembers) {
      if (newIdSet.has(member.id)) continue;
      const refusal = await leaveTripRefusal(db, tripId, member.id);
      if (refusal) throw new MoneyRuleError(refusal);
    }

    await writeTrip(db, tripId, input);

    // Remove members who were unselected
    for (const member of currentMembers) {
      if (!newIdSet.has(member.id)) await leaveTrip(db, tripId, member.id);
    }

    // Add newly selected members (snapshots current profile classification)
    const currentIds = new Set(currentMembers.map((m) => m.id));
    for (const travellerId of newIdSet) {
      if (!currentIds.has(travellerId)) await addTripTraveller(db, tripId, travellerId);
    }
  });
}

/** Rows cascade. Files on disk are reclaimed by the GC sweep, not here. */
export async function deleteTrip(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM trips WHERE id = ?`, id);
}

/**
 * `payments`: recorded against bookings (3D-1); `splits`: bookings and expenses split (3D-2) —
 * named in the deletion's confirmation.
 */
type TripContents = { items: number; files: number; expenses: number; payments: number; splits: number };

export async function countTripContents(
  db: SQLiteDatabase,
  id: string,
): Promise<TripContents> {
  const row = await db.getFirstAsync<TripContents>(COUNT_TRIP_CONTENTS, { $id: id });
  return {
    items: row?.items ?? 0,
    files: row?.files ?? 0,
    expenses: row?.expenses ?? 0,
    payments: row?.payments ?? 0,
    splits: row?.splits ?? 0,
  };
}

function serialiseTravellers(names: string[] | undefined): string | null {
  return names && names.length > 0 ? JSON.stringify(names) : null;
}

export async function markLegacyTravellerConverted(
  db: SQLiteDatabase,
  tripId: string,
  legacyName: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ converted_travellers: string | null }>(
    `SELECT converted_travellers FROM trips WHERE id = ?`,
    tripId,
  );
  if (!row) {
    throw new Error('Trip not found');
  }
  let converted: string[] = [];
  if (row.converted_travellers) {
    try {
      const parsed: unknown = JSON.parse(row.converted_travellers);
      if (Array.isArray(parsed)) {
        converted = parsed.filter((n): n is string => typeof n === 'string');
      }
    } catch {}
  }
  const trimmed = legacyName.trim();
  if (!converted.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())) {
    converted.push(trimmed);
  }
  await db.runAsync(
    `UPDATE trips SET converted_travellers = ?, updated_at = ? WHERE id = ?`,
    JSON.stringify(converted),
    new Date().toISOString(),
    tripId,
  );
}
