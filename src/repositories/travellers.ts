import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from './settings';
import { markLegacyTravellerConverted } from './trips';

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
  SELECT_TRIPS_WITHOUT_TRAVELLER,
  UPDATE_TRAVELLER_CLASSIFICATION,
  UPDATE_TRIP_TRAVELLER_CLASSIFICATION,
} from '../db/queries';
import {
  parseTravellerRow,
  type Traveller,
  type TravellerClassification,
  type TravellerRow,
} from '../domain/traveller';

export const TRAVELLER_TABLES = ['travellers', 'trip_travellers', 'item_participants'] as const;

/** What "Me" is read from: the setting, and the profile it names. */
export const ME_TABLES = ['settings', 'travellers'] as const;

/**
 * The traveller profile that is the person using the app (2B-0) — a profile like any other,
 * marked by one setting, so there can only ever be one. A local, per-phone identity: not an
 * account, and not who owns or pays for anything. Null until chosen, or if the profile is gone.
 */
export async function getMe(db: SQLiteDatabase): Promise<Traveller | null> {
  const id = await getSetting(db, 'me_traveller_id');
  if (!id) return null;
  return (await listTravellers(db)).find((traveller) => traveller.id === id) ?? null;
}

/** Marks an existing profile as Me. Nothing else changes: no trip, item or list is touched. */
export async function setMe(db: SQLiteDatabase, travellerId: string): Promise<void> {
  const exists = (await listTravellers(db)).some((traveller) => traveller.id === travellerId);
  if (!exists) throw new Error('That traveller no longer exists');
  await setSetting(db, 'me_traveller_id', travellerId);
}

/** A new profile that is Me — an adult unless said otherwise — in one step. */
export async function createMe(
  db: SQLiteDatabase,
  name: string,
  classification: TravellerClassification = 'adult',
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await createTraveller(db, name, classification);
    await setSetting(db, 'me_traveller_id', id);
  });
  return id;
}

export type TripWithoutTraveller = { id: string; name: string; startDate: string; endDate: string };

export async function listTripsWithout(
  db: SQLiteDatabase,
  travellerId: string,
): Promise<TripWithoutTraveller[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    start_date: string;
    end_date: string;
  }>(SELECT_TRIPS_WITHOUT_TRAVELLER, { $id: travellerId });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
  }));
}

/**
 * Puts a traveller on the trips chosen, all or none. Membership only: who goes to each booking,
 * prices, expenses and lists are left exactly as they are. A trip they are on already is skipped.
 */
export async function addTravellerToTrips(
  db: SQLiteDatabase,
  travellerId: string,
  tripIds: readonly string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const tripId of new Set(tripIds)) await addTripTraveller(db, tripId, travellerId);
  });
}

export async function listTravellers(db: SQLiteDatabase): Promise<Traveller[]> {
  const rows = await db.getAllAsync<TravellerRow>(SELECT_TRAVELLERS);
  return rows.map(parseTravellerRow);
}

export async function createTraveller(
  db: SQLiteDatabase,
  name: string,
  classification: TravellerClassification = 'unspecified',
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(INSERT_TRAVELLER, {
    $id: id,
    $name: name,
    $classification: classification,
    $now: new Date().toISOString(),
  });
  return id;
}

export async function updateTravellerClassification(
  db: SQLiteDatabase,
  id: string,
  classification: TravellerClassification,
): Promise<void> {
  await db.runAsync(UPDATE_TRAVELLER_CLASSIFICATION, {
    $id: id,
    $classification: classification,
    $now: new Date().toISOString(),
  });
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
): Promise<{ deleted: true } | { deleted: false; uses: TravellerUses; isMe?: true }> {
  const uses = await travellerUses(db, id);
  if (uses.trips.length > 0 || uses.items > 0) return { deleted: false, uses };
  // Me is not deleted by accident: another profile is made Me first.
  if ((await getSetting(db, 'me_traveller_id')) === id) return { deleted: false, uses, isMe: true };
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
  classification?: TravellerClassification,
): Promise<void> {
  let resolved = classification;
  if (!resolved) {
    const row = await db.getFirstAsync<{ classification: string | null }>(
      `SELECT classification FROM travellers WHERE id = ?`,
      travellerId,
    );
    resolved =
      row?.classification === 'adult' || row?.classification === 'child'
        ? row.classification
        : 'unspecified';
  }
  await db.runAsync(INSERT_TRIP_TRAVELLER, {
    $tripId: tripId,
    $travellerId: travellerId,
    $classification: resolved,
  });
}

export async function updateTripTravellerClassification(
  db: SQLiteDatabase,
  tripId: string,
  travellerId: string,
  classification: TravellerClassification,
): Promise<void> {
  await db.runAsync(UPDATE_TRIP_TRAVELLER_CLASSIFICATION, {
    $tripId: tripId,
    $travellerId: travellerId,
    $classification: classification,
  });
}

/** A new profile, going on this trip: both or neither. */
export async function createTripTraveller(
  db: SQLiteDatabase,
  tripId: string,
  name: string,
  classification: TravellerClassification = 'unspecified',
): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await createTraveller(db, name, classification);
    await addTripTraveller(db, tripId, id, classification);
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

export type ConvertLegacyTravellerOptions = {
  tripId: string;
  legacyName: string;
  existingTravellerId?: string;
  newProfileName?: string;
  classification?: TravellerClassification;
};

export type ConvertLegacyTravellerResult = {
  travellerId: string | null;
  created: boolean;
  alreadyConverted: boolean;
};

/**
 * Converts a legacy trip traveller name to a profile membership atomically.
 * Links an explicitly selected existing profile or creates a new one, snapshots the classification,
 * and records the legacy name in `converted_travellers` within a single database transaction.
 * Preserves the original `trips.travellers` array.
 *
 * Idempotent: Checks `converted_travellers` inside the transaction before creating or linking.
 * If already converted, produces a defined no-op outcome without creating another profile,
 * modifying membership/classification, or re-adding a traveller previously removed from the trip.
 */
export async function convertLegacyTraveller(
  db: SQLiteDatabase,
  options: ConvertLegacyTravellerOptions,
): Promise<ConvertLegacyTravellerResult> {
  const { tripId, legacyName, existingTravellerId, newProfileName, classification } = options;
  let travellerId = existingTravellerId ?? null;
  let created = false;
  let alreadyConverted = false;

  await db.withTransactionAsync(async () => {
    // 1. Check the converted marker inside the transaction before creating or linking anything
    const tripRow = await db.getFirstAsync<{ converted_travellers: string | null }>(
      `SELECT converted_travellers FROM trips WHERE id = ?`,
      tripId,
    );
    if (!tripRow) {
      throw new Error('Trip not found');
    }

    let converted: string[] = [];
    if (tripRow.converted_travellers) {
      try {
        const parsed: unknown = JSON.parse(tripRow.converted_travellers);
        if (Array.isArray(parsed)) {
          converted = parsed.filter((n): n is string => typeof n === 'string');
        }
      } catch {}
    }

    const trimmed = legacyName.trim();
    if (converted.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())) {
      alreadyConverted = true;
      return;
    }

    // 2. Perform the conversion write operations
    if (travellerId) {
      const profile = await db.getFirstAsync<{ id: string; classification: string | null }>(
        `SELECT id, classification FROM travellers WHERE id = ?`,
        travellerId,
      );
      if (!profile) {
        throw new Error('Traveller profile not found');
      }
      const resolvedClassification =
        classification ??
        (profile.classification === 'adult' || profile.classification === 'child'
          ? profile.classification
          : 'unspecified');

      await db.runAsync(INSERT_TRIP_TRAVELLER, {
        $tripId: tripId,
        $travellerId: travellerId,
        $classification: resolvedClassification,
      });
    } else {
      created = true;
      const name = (newProfileName ?? legacyName).trim();
      const resolvedClassification = classification ?? 'unspecified';
      const newId = randomUUID();
      await db.runAsync(INSERT_TRAVELLER, {
        $id: newId,
        $name: name,
        $classification: resolvedClassification,
        $now: new Date().toISOString(),
      });
      travellerId = newId;

      await db.runAsync(INSERT_TRIP_TRAVELLER, {
        $tripId: tripId,
        $travellerId: newId,
        $classification: resolvedClassification,
      });
    }

    // 3. Record conversion marker in converted_travellers
    converted.push(trimmed);
    await db.runAsync(
      `UPDATE trips SET converted_travellers = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(converted),
      new Date().toISOString(),
      tripId,
    );
  });

  return { travellerId, created, alreadyConverted };
}

export { markLegacyTravellerConverted } from './trips';
