import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { defaultItemDate } from '../../../src/domain/trip';
import { tripItemFormValues } from '../../../src/domain/tripItem';
import { ItemForm } from '../../../src/features/items/ItemForm';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  getTripItem,
  TRIP_ITEM_TABLES,
  updateTripItem,
} from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../../src/ui/tokens';
import { askForRemindersIfDue } from '../../../src/notifications/reminders';

/** Deleting lives on the detail screen, where the cancel-first rule is shown (decision log D21). */
export default function EditItem() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const { data: item, loading } = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
    [itemId],
  );

  const tripId = item?.tripId;
  const { data: trip } = useLiveQuery(
    useCallback(async (database) => (tripId ? getTrip(database, tripId) : null), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  if (loading || (item && !trip)) {
    return (
      <Screen>
        <ScreenHeader title="Edit item" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!item || !trip) {
    return (
      <Screen>
        <ScreenHeader title="Edit item" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This item no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Edit item" />
      <ItemForm
        submitLabel="Save changes"
        defaultTz={trip.defaultTz}
        defaultDate={defaultItemDate(trip)}
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

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
