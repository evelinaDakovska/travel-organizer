import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTripId } from '../../../../src/features/trips/TripContext';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { listPlaces, TRIP_ITEM_TABLES } from '../../../../src/repositories/tripItems';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { radius, spacing, type, useColors } from '../../../../src/ui/tokens';

/** Ideas, most wanted first. */
export default function PlacesScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

  const { data: places, loading } = useLiveQuery(
    useCallback((database) => listPlaces(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  return (
    <Screen>
      <ScreenHeader title="Places" subtitle="Ideas, not yet booked" />

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {places && places.length > 0 ? (
            places.map((place) => (
              <ItemRow key={place.id} item={place} onPress={() => router.push(`/item/${place.id}`)} />
            ))
          ) : (
            <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
              <Text style={[type.body, { color: c.textMuted }]}>
                No ideas saved yet. Add somewhere you might go — a café someone recommended, a
                viewpoint — and book it later.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: 120 },
  well: { borderRadius: radius.lg, padding: spacing.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
