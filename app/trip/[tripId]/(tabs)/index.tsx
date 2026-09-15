import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { openTasks, upNext } from '../../../../src/domain/itinerary';
import { groupResourcesByItem } from '../../../../src/domain/resource';
import { ResourceList } from '../../../../src/features/resources/ResourceList';
import { EntryCard } from '../../../../src/features/timeline/EntryCard';
import { TaskRow } from '../../../../src/features/trips/TaskRow';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { TripSummary } from '../../../../src/features/trips/TripSummary';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { useNow } from '../../../../src/hooks/useNow';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
  listResources,
  RESOURCE_TABLES,
} from '../../../../src/repositories/resources';
import {
  listTripItems,
  setTaskCompleted,
  TRIP_ITEM_TABLES,
} from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../../src/ui/tokens';

export default function NowScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const now = useNow();
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
  const { data: documents } = useLiveQuery(
    useCallback((database) => listResources(database, { scope: 'trip', id: tripId }), [tripId]),
    RESOURCE_TABLES,
    [tripId],
  );

  const next = useMemo(() => upNext(items ?? [], now), [items, now]);
  const tasks = useMemo(() => openTasks(items ?? []), [items]);
  const byItem = useMemo(() => groupResourcesByItem(attachments ?? []), [attachments]);

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Now" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Now" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This trip no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Now"
        subtitle={trip.name}
        action={
          <Pressable
            onPress={() => router.push(`/trip/${trip.id}/edit`)}
            hitSlop={12}
            accessibilityRole="button">
            <Text style={[type.bodyStrong, { color: c.accentText }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {next.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Up next</SectionLabel>
            {next.map((entry) => (
              <EntryCard
                key={entry.key}
                entry={entry}
                resources={byItem.get(entry.item.id) ?? []}
                showDate
                onPress={() => router.push(`/item/${entry.item.id}`)}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>Open tasks</SectionLabel>
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => setTaskCompleted(db, task.id, true)}
                onPress={() => router.push(`/item/${task.id}`)}
              />
            ))
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>Nothing left to do.</Text>
          )}
        </View>

        <View style={styles.section}>
          <SectionLabel>This trip</SectionLabel>
          <TripSummary trip={trip} />
        </View>

        <ResourceList
          owner={{ scope: 'trip', id: trip.id }}
          resources={documents ?? []}
          title="Trip documents"
          emptyText="Insurance, passport scans, visas — anything that belongs to the whole trip."
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Room at the bottom for the floating add button.
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: 120 },
  section: { gap: spacing.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
