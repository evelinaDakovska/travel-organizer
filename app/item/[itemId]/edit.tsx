import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { defaultItemDate } from '../../../src/domain/trip';
import { tripItemFormValues } from '../../../src/domain/tripItem';
import { ItemForm } from '../../../src/features/items/ItemForm';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  getTripItem,
  itemSplitFacts,
  listKnownPlaces,
  TRIP_ITEM_TABLES,
  updateTripItem,
} from '../../../src/repositories/tripItems';
import {
  listItemParticipants,
  listTripTravellers,
  TRAVELLER_TABLES,
} from '../../../src/repositories/travellers';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { askForRemindersIfDue } from '../../../src/notifications/reminders';
import { alertRefusal } from '../../../src/features/payments/refusal';
import { withSettlementReview } from '../../../src/features/settle/settlementReviewPrompt';
import { overpaidWarning } from '../../../src/domain/bookingPayments';
import { confirmSplitMismatch } from '../../../src/features/split/confirmMismatch';

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
  // Who can go and who does, read together: the form starts from them, so it waits for both.
  const peopleQuery = useLiveQuery(
    useCallback(
      async (database) => {
        if (!tripId) return null;
        const [travellers, participants] = await Promise.all([
          listTripTravellers(database, tripId),
          listItemParticipants(database, itemId),
        ]);
        return { travellers, participants: participants.map((person) => person.id) };
      },
      [tripId, itemId],
    ),
    TRAVELLER_TABLES,
    [tripId, itemId],
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

  // Saving before these are read would clear who takes part (C2): no form until they are.
  const people = peopleQuery.data;
  const peopleView = queryView(peopleQuery);
  if (peopleView !== 'ready' || !people) {
    return (
      <QueryScreen
        title="Edit item"
        view={peopleView === 'missing' ? 'loading' : peopleView}
        missingText=""
        what="who is going"
        onRetry={peopleQuery.refetch}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Edit item" />
      <ItemForm
        submitLabel="Save changes"
        editing
        defaultTz={trip.defaultTz}
        defaultDate={defaultItemDate(trip)}
        knownPlaces={knownPlaces ?? []}
        defaultValues={tripItemFormValues(item)}
        travellers={people.travellers}
        defaultParticipants={people.participants}
        onSubmit={async (input, participants) => {
          // A price below what is recorded is allowed, said first (3D-1 §5).
          const overpaid =
            input.priceAmount !== undefined && input.priceCurrency
              ? overpaidWarning(item.recordedPaid, input.priceAmount, input.priceCurrency)
              : null;
          if (overpaid && !(await confirmOverpaid(overpaid))) return;
          // A split by amounts that the new price no longer matches: said first (3D-2 §4). A new
          // currency is not warned about here — with a split by amounts it is refused on save.
          if (
            input.priceCurrency &&
            input.priceCurrency === item.priceCurrency &&
            !(await confirmSplitMismatch(await itemSplitFacts(db, item.id), input.priceAmount, input.priceCurrency))
          ) {
            return;
          }
          try {
            // A shared cost leaving a currency with settlements: said first (§15).
            if (!(await withSettlementReview((options) => updateTripItem(db, item.id, input, participants, options)))) {
              return;
            }
          } catch (error) {
            // An edit that would strand payments (3D-1): refused, nothing saved, reason shown.
            if (alertRefusal(error)) return;
            throw error;
          }
          router.back();
          void askForRemindersIfDue(db, item.id);
        }}
      />
    </Screen>
  );
}

function confirmOverpaid(message: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert('Lower the price?', message, [
      { text: 'Go back', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Save', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
