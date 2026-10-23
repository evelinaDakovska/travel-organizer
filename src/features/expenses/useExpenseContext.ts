import { useCallback } from 'react';

import { useLiveQuery } from '../../hooks/useLiveQuery';
import { lastPayerId, PAYMENT_TABLES } from '../../repositories/payments';
import { listTripTravellers, TRAVELLER_TABLES } from '../../repositories/travellers';
import { listTripItems } from '../../repositories/tripItems';
import { getTrip } from '../../repositories/trips';

/**
 * What the expense form offers beyond its own fields (3D-1): who can be the payer, the payer last
 * recorded (a suggestion), and the bookings an expense could pay for; and the trip's reporting
 * currency, for what it was charged in (Phase 4).
 */
export function useExpenseContext(tripId: string | undefined) {
  return useLiveQuery(
    useCallback(
      async (database) => {
        if (!tripId) return null;
        const [travellers, bookings, lastPayer, trip] = await Promise.all([
          listTripTravellers(database, tripId),
          listTripItems(database, tripId),
          lastPayerId(database, tripId),
          getTrip(database, tripId),
        ]);
        return { travellers, bookings, lastPayerId: lastPayer, reportCurrency: trip?.reportCurrency ?? null };
      },
      [tripId],
    ),
    [...PAYMENT_TABLES, ...TRAVELLER_TABLES, 'trips'],
    [tripId],
  );
}
