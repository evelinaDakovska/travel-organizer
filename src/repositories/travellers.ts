import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  COUNT_TRAVELLER_ITEMS,
  DELETE_ITEM_PARTICIPANTS,
  DELETE_TRIP_TRAVELLER,
  DELETE_TRIP_TRAVELLER_PARTICIPATION,
  INSERT_ITEM_PARTICIPANT,
  INSERT_TRAVELLER,
  INSERT_TRIP_TRAVELLER,
  RENAME_TRAVELLER,
  SELECT_ITEM_PARTICIPANTS,
  SELECT_TRAVELLER_TRIPS,
  SELECT_TRAVELLERS,
  SELECT_TRIP_TRAVELLERS,
} from '../db/queries';
import { parseTravellerRow, type Traveller, type TravellerRow } from '../domain/traveller';

export const TRAVELLER_TABLES = ['travellers', 'trip_travellers', 'item_participants'] as const;

export async function listTravellers(db: SQLiteDatabase): Promise<Traveller[]> {
  const rows = await db.getAllAsync<TravellerRow>(SELECT_TRAVELLERS);
  return rows.map(parseTravellerRow);
}

export async function createTraveller(db: SQLiteDatabase, name: string): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_TRAVELLER, { $id: id, $name: name, $now: new Date().toISOString() });
  return id;
}

/** A rename reads everywhere the profile is linked; no price or item text changes (FB-13). */
export async function renameTraveller(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync(RENAME_TRAVELLER, { $id: id, $name: name, $now: new Date().toISOString() });
}

export type TravellerUses = { trips: string[]; items: number };

export async function travellerUses(db: SQLiteDatabase, id: string): Promise<TravellerUses> {
  const [trips, items] = await Promise.all([
    db.getAllAsync<{ name: string }>(SELECT_TRAVELLER_TRIPS, { $id: id }),
    db.getFirstAsync<{ n: number }>(COUNT_TRAVELLER_ITEMS, { $id: id }),
  ]);
  return { trips: trips.map((trip) => trip.name), items: items?.n ?? 0 };
}

/**
 * Deletes a profile nothing uses. One a trip or item still uses is refused — here, so the screen
 * can say where, and by the database's RESTRICT whatever calls this.
 */
export async function deleteTraveller(
  db: SQLiteDatabase,
  id: string,
): Promise<{ deleted: true } | { deleted: false; uses: TravellerUses }> {
  const uses = await travellerUses(db, id);
  if (uses.trips.length > 0 || uses.items > 0) return { deleted: false, uses };
  await db.runAsync(`DELETE FROM travellers WHERE id = $id`, { $id: id });
  return { deleted: true };
}

export async function listTripTravellers(db: SQLiteDatabase, tripId: string): Promise<Traveller[]> {
  const rows = await db.getAllAsync<TravellerRow>(SELECT_TRIP_TRAVELLERS, { $tripId: tripId });
  return rows.map(parseTravellerRow);
}

export async function addTripTraveller(
  db: SQLiteDatabase,
  tripId: string,
  travellerId: string,
): Promise<void> {
  await db.runAsync(INSERT_TRIP_TRAVELLER, { $tripId: tripId, $travellerId: travellerId });
}

/** A new profile, going on this trip: both or neither. */
export async function createTripTraveller(
  db: SQLiteDatabase,
  tripId: string,
  name: string,
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await createTraveller(db, name);
    await addTripTraveller(db, tripId, id);
  });
  return id;
}

/** Off the trip and off its items, in one step; the profile itself stays. */
export async function removeTripTraveller(
  db: SQLiteDatabase,
  tripId: string,
  travellerId: string,
): Promise<void> {
  const params = { $tripId: tripId, $travellerId: travellerId };
  await db.withTransactionAsync(async () => {
    await db.runAsync(DELETE_TRIP_TRAVELLER_PARTICIPATION, params);
    await db.runAsync(DELETE_TRIP_TRAVELLER, params);
  });
}

export async function listItemParticipants(
  db: SQLiteDatabase,
  itemId: string,
): Promise<Traveller[]> {
  const rows = await db.getAllAsync<TravellerRow>(SELECT_ITEM_PARTICIPANTS, { $itemId: itemId });
  return rows.map(parseTravellerRow);
}

/**
 * Replaces who takes part in an item. Not a transaction of its own: the item's save wraps it, so
 * an item and its participants are written together (`tripItems.ts`).
 */
export async function writeItemParticipants(
  db: SQLiteDatabase,
  itemId: string,
  travellerIds: readonly string[],
): Promise<void> {
  await db.runAsync(DELETE_ITEM_PARTICIPANTS, { $itemId: itemId });
  for (const travellerId of new Set(travellerIds)) {
    await db.runAsync(INSERT_ITEM_PARTICIPANT, { $itemId: itemId, $travellerId: travellerId });
  }
}
