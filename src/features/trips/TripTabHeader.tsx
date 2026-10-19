import type { ReactNode } from 'react';

import { formatDateRange } from '../../domain/format';
import { tripContextLine, type Trip } from '../../domain/trip';
import { ScreenHeader } from '../../ui/components/ScreenHeader';

type Props = {
  title: string;
  /** Null while the trip is still loading: the tab's title shows alone. */
  trip: Trip | null | undefined;
  action?: ReactNode;
};

/**
 * The header of a trip's inner tabs: the trip above the tab's title, its dates below. Overview
 * has its own header, led by the trip itself.
 */
export function TripTabHeader({ title, trip, action }: Props) {
  return (
    <ScreenHeader
      context={trip ? tripContextLine(trip) : undefined}
      title={title}
      subtitle={trip ? formatDateRange(trip.startDate, trip.endDate) : undefined}
      action={action}
    />
  );
}
