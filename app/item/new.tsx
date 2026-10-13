import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

import { isValidLocal } from '../../src/domain/time';
import { defaultItemDate } from '../../src/domain/trip';
import { DEFAULT_CURRENCY, TRIP_ITEM_KINDS, type TripItemKind } from '../../src/domain/tripItem';
import { ItemForm } from '../../src/features/items/ItemForm';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  createTripItem,
  createTripItems,
  listKnownPlaces,
  TRIP_ITEM_TABLES,
} from '../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../src/repositories/trips';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { askForRemindersIfDue } from '../../src/notifications/reminders';

export default function NewItem() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId: string;
    kind?: string;
    date?: string;
    idea?: string;
  }>();
  const { tripId } = params;
  const kind = asKind(params.kind);
  // From a day on the Timeline (B3): a plan for that day.
  const date = params.date && isValidLocal(params.date, 'date') ? params.date : undefined;
  // From Places (B7) a saved idea; from anywhere else a plan in the itinerary (FB-10).
  const idea = params.idea === '1' && kind !== 'task';

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const { data: knownPlaces } = useLiveQuery(
    useCallback((database) => listKnownPlaces(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  const trip = tripQuery.data;
  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="New item"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Add to trip" />
      <ItemForm
        submitLabel="Add"
        defaultTz={trip.defaultTz}
        defaultDate={date ?? defaultItemDate(trip)}
        knownPlaces={knownPlaces ?? []}
        defaultValues={{
          kind,
          // A to-do is not an idea to book later; as one it would also land on Places.
          subkind: null,
          status: idea ? 'idea' : 'confirmed',
          start: date ? { local: date } : undefined,
          priority: null,
          title: '',
          priceCurrency: DEFAULT_CURRENCY,
          isPaid: false,
        }}
        onSubmitJourney={async (inputs) => {
          const [first] = await createTripItems(db, trip.id, inputs);
          router.replace(`/item/${first}`);
          void askForRemindersIfDue(db, first);
        }}
        onSubmit={async (input) => {
          const id = await createTripItem(db, trip.id, input);
          router.replace(`/item/${id}`);
          void askForRemindersIfDue(db, id);
        }}
      />
    </Screen>
  );
}

/** The kind arrives as a route param, so it cannot be trusted to be one of ours. */
function asKind(value: string | undefined): TripItemKind {
  return TRIP_ITEM_KINDS.includes(value as TripItemKind) ? (value as TripItemKind) : 'activity';
}

