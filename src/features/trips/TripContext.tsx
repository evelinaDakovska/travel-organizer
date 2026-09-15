import { createContext, useContext, type ReactNode } from 'react';

const TripIdContext = createContext<string | null>(null);

/**
 * Trip tabs read their trip from here rather than from route params: a tab reached through the
 * tab bar is not handed the parent route's `tripId`, and global params change while an item is
 * open on top of the tabs.
 */
export function TripIdProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  return <TripIdContext.Provider value={tripId}>{children}</TripIdContext.Provider>;
}

export function useTripId(): string {
  const tripId = useContext(TripIdContext);
  if (tripId === null) throw new Error('useTripId must be used inside the trip tabs');
  return tripId;
}
