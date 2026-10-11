import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

import { defaultItemDate } from '../../../src/domain/trip';
import { tripItemFormValues } from '../../../src/domain/tripItem';
import { ItemForm } from '../../../src/features/items/ItemForm';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  getTripItem,
  listKnownPlaces,
  TRIP_ITEM_TABLES,
  updateTripItem,
} from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { askForRemindersIfDue } from '../../../src/notifications/reminders';

/** Deleting lives on the detail screen, where the cancel-first rule is shown (decision log D21). */
export default function EditItem() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const itemQuery = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
    [itemId],
  );

  const item = itemQuery.data;
  const tripId = item?.tripId;
  const tripQuery = useLiveQuery(
    useCallback(async (database) => (tripId ? getTrip(database, tripId) : null), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const { data: knownPlaces } = useLiveQuery(
    useCallback(
      async (database) => (tripId ? listKnownPlaces(database, tripId) : []),
      [tripId],
    ),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  const itemView = queryView(itemQuery);
  if (itemView !== 'ready' || !item) {
    return (
      <QueryScreen
        title="Edit item"
        view={itemView}
        missingText="This item no longer exists."
        what="this item"
        onRetry={itemQuery.refetch}
      />
    );
  }
  const trip = tripQuery.data;
  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Edit item"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Edit item" />
      <ItemForm
        submitLabel="Save changes"
        defaultTz={trip.defaultTz}
        defaultDate={defaultItemDate(trip)}
        knownPlaces={knownPlaces ?? []}
        defaultValues={tripItemFormValues(item)}
        onSubmit={async (input) => {
          await updateTripItem(db, item.id, input);
          router.back();
          void askForRemindersIfDue(db, item.id);
        }}
      />
    </Screen>
  );
}

