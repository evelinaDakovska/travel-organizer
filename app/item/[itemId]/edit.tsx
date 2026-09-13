import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { tripItemFormValues } from '../../../src/domain/tripItem';
import { ItemForm } from '../../../src/features/items/ItemForm';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listResources } from '../../../src/repositories/resources';
import {
  deleteTripItem,
  getTripItem,
  TRIP_ITEM_TABLES,
  updateTripItem,
} from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { spacing, type, useColors } from '../../../src/ui/tokens';

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

  /** Names the blast radius — these files may be the only copies. */
  const confirmDelete = useCallback(async () => {
    const resources = await listResources(db, { scope: 'item', id: itemId });
    const files = resources.filter((resource) => resource.kind === 'file').length;

    Alert.alert(
      `Delete ${item?.title ?? 'this item'}?`,
      files > 0
        ? `This also removes ${files} saved file${files === 1 ? '' : 's'}. It cannot be undone.`
        : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTripItem(db, itemId);
            router.replace(tripId ? `/trip/${tripId}` : '/');
          },
        },
      ],
    );
  }, [db, itemId, item?.title, tripId, router]);

  if (loading || (item && !trip)) {
    return (
      <Screen>
        <ScreenHeader title="Edit" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!item || !trip) {
    return (
      <Screen>
        <ScreenHeader title="Edit" />
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
        defaultValues={tripItemFormValues(item)}
        onSubmit={async (input) => {
          await updateTripItem(db, item.id, input);
          router.back();
        }}
      />
      <View style={styles.danger}>
        <Button label="Delete item" variant="danger" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  danger: { padding: spacing.xl, paddingTop: 0 },
});
