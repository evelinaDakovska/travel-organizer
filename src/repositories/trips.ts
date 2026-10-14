import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { COUNT_TRIP_CONTENTS } from '../db/queries';
import { parseTripRow, type Trip, type TripInput, type TripRow } from '../domain/trip';
import { recomputeTripInstants } from './tripItems';

export const TRIP_TABLES = ['trips'] as const;

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

export async function updateTrip(
  db: SQLiteDatabase,
  id: string,
  input: TripInput,
): Promise<void> {
  const previous = await db.getFirstAsync<{ default_tz: string }>(
    `SELECT default_tz FROM trips WHERE id = ?`,
    id,
  );
  const zoneChanged = previous !== null && previous.default_tz !== input.defaultTz;

  // One transaction: items whose instants were derived from the old zone must not survive
  // a crash between the two writes, because nothing would recompute them later.
  await db.withTransactionAsync(async () => {
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
  });
}

/** Rows cascade. Files on disk are reclaimed by the GC sweep, not here. */
export async function deleteTrip(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM trips WHERE id = ?`, id);
}

type TripContents = { items: number; files: number; expenses: number };

export async function countTripContents(
  db: SQLiteDatabase,
  id: string,
): Promise<TripContents> {
  const row = await db.getFirstAsync<TripContents>(COUNT_TRIP_CONTENTS, { $id: id });
  return { items: row?.items ?? 0, files: row?.files ?? 0, expenses: row?.expenses ?? 0 };
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
  let converted: string[] = [];
  if (row?.converted_travellers) {
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
