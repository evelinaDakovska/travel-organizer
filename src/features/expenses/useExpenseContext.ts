import { useCallback } from 'react';

import { useLiveQuery } from '../../hooks/useLiveQuery';
import { lastPayerId, PAYMENT_TABLES } from '../../repositories/payments';
import { listTripTravellers, TRAVELLER_TABLES } from '../../repositories/travellers';
import { listTripItems } from '../../repositories/tripItems';

/**
 * What the expense form offers beyond its own fields (3D-1): who can be the payer, the payer last
 * recorded (a suggestion), and the bookings an expense could pay for.
 */
export function useExpenseContext(tripId: string | undefined) {
  return useLiveQuery(
    useCallback(
      async (database) => {
        if (!tripId) return null;
        const [travellers, bookings, lastPayer] = await Promise.all([
          listTripTravellers(database, tripId),
          listTripItems(database, tripId),
          lastPayerId(database, tripId),
        ]);
        return { travellers, bookings, lastPayerId: lastPayer };
      },
      [tripId],
    ),
    [...PAYMENT_TABLES, ...TRAVELLER_TABLES],
    [tripId],
  );
}
