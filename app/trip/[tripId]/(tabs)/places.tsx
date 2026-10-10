import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { bookedPlaces } from '../../../../src/domain/places';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import {
  listPlaces,
  listTripItems,
  TRIP_ITEM_TABLES,
} from '../../../../src/repositories/tripItems';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../../../src/ui/tokens';

/**
 * Ideas, most wanted first — opening one offers Move to Timeline. Below them, the booked items
 * that say where they are, so every address in the trip is in one list (U5).
 */
export default function PlacesScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

  const { data: places, loading } = useLiveQuery(
    useCallback((database) => listPlaces(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const { data: items } = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const booked = useMemo(() => bookedPlaces(items ?? []), [items]);

  return (
    <Screen>
      <ScreenHeader
        title="Places"
        subtitle="Ideas, and where your bookings are"
        action={<SearchButton tripId={tripId} />}
      />

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <SectionLabel>Ideas</SectionLabel>
            {places && places.length > 0 ? (
              places.map((place) => (
                <ItemRow
                  key={place.id}
                  item={place}
                  onPress={() => router.push(`/item/${place.id}`)}
                />
              ))
            ) : (
              <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
                <Text style={[type.body, { color: c.textMuted }]}>
                  No ideas saved yet. Add somewhere you might go — a café someone recommended, a
                  viewpoint — and move it onto the timeline once it is booked.
                </Text>
              </View>
            )}
          </View>

          {booked.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>Booked</SectionLabel>
              {booked.map((item) => (
                <ItemRow key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: 120 },
  section: { gap: spacing.md },
  well: { borderRadius: radius.lg, padding: spacing.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
