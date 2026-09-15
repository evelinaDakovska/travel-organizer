import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatShortDate } from '../../../../src/domain/format';
import { undatedConfirmed } from '../../../../src/domain/itinerary';
import { groupResourcesByItem } from '../../../../src/domain/resource';
import { buildTimeline } from '../../../../src/domain/timeline';
import { EntryCard } from '../../../../src/features/timeline/EntryCard';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
} from '../../../../src/repositories/resources';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../../../src/ui/tokens';

export default function TimelineScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

  const { data: trip, loading } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const { data: items } = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const { data: attachments } = useLiveQuery(
    useCallback((database) => listItemResourcesForTrip(database, tripId), [tripId]),
    ITEM_RESOURCE_TABLES,
    [tripId],
  );

  // Cancelled items never reach the timeline; dated ideas stay on their day (decision log D22).
  const days = useMemo(() => buildTimeline(items ?? []), [items]);
  const undated = useMemo(() => undatedConfirmed(items ?? []), [items]);
  const byItem = useMemo(() => groupResourcesByItem(attachments ?? []), [attachments]);

  if (loading || !trip) {
    return (
      <Screen>
        <ScreenHeader title="Timeline" />
        <View style={styles.centre}>
          {loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>This trip no longer exists.</Text>
          )}
        </View>
      </Screen>
    );
  }

  const open = (itemId: string) => router.push(`/item/${itemId}`);

  return (
    <Screen>
      <ScreenHeader
        title="Timeline"
        subtitle={`${trip.name} · ${formatDateRange(trip.startDate, trip.endDate)}`}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {days.length === 0 && undated.length === 0 ? (
          <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
            <Text style={[type.body, { color: c.textMuted }]}>
              Nothing on the timeline yet. Anything with a date appears here, day by day.
            </Text>
          </View>
        ) : null}

        {days.map((day) => (
          <View key={day.day} style={styles.section}>
            <SectionLabel>{formatShortDate(day.day)}</SectionLabel>
            {day.entries.map((entry) => (
              <EntryCard
                key={entry.key}
                entry={entry}
                resources={byItem.get(entry.item.id) ?? []}
                onPress={() => open(entry.item.id)}
              />
            ))}
          </View>
        ))}

        {undated.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>No date yet</SectionLabel>
            {undated.map((item) => (
              <ItemRow key={item.id} item={item} onPress={() => open(item.id)} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: 120 },
  section: { gap: spacing.md },
  well: { borderRadius: radius.lg, padding: spacing.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
