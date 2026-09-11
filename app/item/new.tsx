import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TRIP_ITEM_KINDS, type TripItemKind } from '../../src/domain/tripItem';
import { ItemForm } from '../../src/features/items/ItemForm';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { createTripItem } from '../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../src/repositories/trips';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function NewItem() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId, kind } = useLocalSearchParams<{ tripId: string; kind?: string }>();

  const { data: trip, loading } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="New item" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="New item" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This trip no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Add to trip" />
      <ItemForm
        submitLabel="Add"
        defaultTz={trip.defaultTz}
        defaultValues={{
          kind: asKind(kind),
          subkind: null,
          status: 'idea',
          priority: null,
          title: '',
          isPaid: false,
        }}
        onSubmit={async (input) => {
          const id = await createTripItem(db, trip.id, input);
          router.replace(`/item/${id}`);
        }}
      />
    </Screen>
  );
}

/** The kind arrives as a route param, so it cannot be trusted to be one of ours. */
function asKind(value: string | undefined): TripItemKind {
  return TRIP_ITEM_KINDS.includes(value as TripItemKind) ? (value as TripItemKind) : 'activity';
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
