import type { SQLiteDatabase } from 'expo-sqlite';

import { SELECT_TRIP_TRAVELLER_CLASSIFICATIONS } from '../db/queries';
import { planningInputOf, type PlanningInput } from '../domain/planningContext';
import { travellerClassificationSchema, type TravellerClassification } from '../domain/traveller';
import { listTripItems } from './tripItems';
import { getTrip } from './trips';

export const PLANNING_TABLES = ['trips', 'trip_items', 'trip_travellers'] as const;

/**
 * Everything Plan with AI may use, for one trip: the trip row, its items (reduced to the planning
 * allowlist at once) and its travellers' classifications. Nothing else is read — not notes, files,
 * links, expenses, lists or settings. Selects only; null when the trip is gone.
 */
export async function readPlanningInput(
  db: SQLiteDatabase,
  tripId: string,
): Promise<PlanningInput | null> {
  const trip = await getTrip(db, tripId);
  if (!trip) return null;
  const items = await listTripItems(db, tripId);
  const rows = await db.getAllAsync<{ classification: string | null }>(
    SELECT_TRIP_TRAVELLER_CLASSIFICATIONS,
    { $tripId: tripId },
  );
  const classifications: TravellerClassification[] = rows.map((row) => {
    const parsed = travellerClassificationSchema.safeParse(row.classification);
    return parsed.success ? parsed.data : 'unspecified';
  });
  return planningInputOf(trip, items, classifications);
}
