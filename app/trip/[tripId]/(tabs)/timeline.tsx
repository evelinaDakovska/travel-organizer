import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatShortDate } from '../../../../src/domain/format';
import { undatedConfirmed } from '../../../../src/domain/itinerary';
import { groupResourcesByItem } from '../../../../src/domain/resource';
import { buildTimeline, landingDay } from '../../../../src/domain/timeline';
import { deviceToday } from '../../../../src/domain/trip';
import { EntryCard } from '../../../../src/features/timeline/EntryCard';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { useNow } from '../../../../src/hooks/useNow';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
} from '../../../../src/repositories/resources';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { Tag } from '../../../../src/ui/components/Tag';
import { opacity, radius, spacing, type, useColors } from '../../../../src/ui/tokens';

export default function TimelineScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const attachmentsQuery = useLiveQuery(
    useCallback((database) => listItemResourcesForTrip(database, tripId), [tripId]),
    ITEM_RESOURCE_TABLES,
    [tripId],
  );

  const trip = tripQuery.data;
  const items = itemsQuery.data;
  const attachments = attachmentsQuery.data;

  // Cancelled items never reach the timeline; dated ideas stay on their day (decision log D22).
  const days = useMemo(() => buildTimeline(items ?? []), [items]);
  const undated = useMemo(() => undatedConfirmed(items ?? []), [items]);
  const byItem = useMemo(() => groupResourcesByItem(attachments ?? []), [attachments]);

  // During the trip the list opens on today (R7) — once, when that day is first laid out, never
  // again on a data update, so an edit while reading another day does not move the list.
  const today = deviceToday(useNow());
  const landing = trip ? landingDay(days.map((day) => day.day), today, trip) : null;
  const scroll = useRef<ScrollView>(null);
  const dayTops = useRef(new Map<string, number>());
  const landed = useRef(false);
  const scrollToDay = (day: string, animated: boolean) => {
    const top = dayTops.current.get(day);
    if (top !== undefined) scroll.current?.scrollTo({ y: Math.max(0, top - spacing.sm), animated });
  };
  const onDayLayout = (day: string, top: number) => {
    dayTops.current.set(day, top);
    if (!landed.current && day === landing) {
      landed.current = true;
      scrollToDay(day, false);
    }
  };

  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Timeline"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }
  const itemsFailed = queryView(itemsQuery) === 'failed';

  const open = (itemId: string) => router.push(`/item/${itemId}`);

  return (
    <Screen>
      <ScreenHeader
        title="Timeline"
        subtitle={`${trip.name} · ${formatDateRange(trip.startDate, trip.endDate)}`}
        action={
          <View style={styles.headerActions}>
            {landing ? (
              <Pressable
                onPress={() => scrollToDay(landing, true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Go to today"
                style={({ pressed }) => ({ opacity: pressed ? opacity.pressed : 1 })}>
                <Text style={[type.bodyStrong, { color: c.accentText }]}>Today</Text>
              </Pressable>
            ) : null}
            <SearchButton tripId={tripId} />
          </View>
        }
      />

      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        <StaleNotice queries={[tripQuery, itemsQuery, attachmentsQuery]} />
        {/* A read that failed is not an empty trip, and must not say it is. */}
        {itemsFailed ? <LoadFailed what="the timeline" onRetry={itemsQuery.refetch} /> : null}
        {queryView(attachmentsQuery) === 'failed' ? (
          <LoadFailed what="the attachments" onRetry={attachmentsQuery.refetch} />
        ) : null}
        {!itemsFailed && items && days.length === 0 && undated.length === 0 ? (
          <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
            <Text style={[type.body, { color: c.textMuted }]}>
              Nothing on the timeline yet. Anything with a date appears here, day by day.
            </Text>
          </View>
        ) : null}

        {days.map((day) => (
          <View
            key={day.day}
            style={styles.section}
            onLayout={(event) => onDayLayout(day.day, event.nativeEvent.layout.y)}>
            <View style={styles.dayHead}>
              <SectionLabel>{formatShortDate(day.day)}</SectionLabel>
              {day.day === today ? <Tag label="Today" tone="accent" /> : null}
            </View>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  well: { borderRadius: radius.lg, padding: spacing.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
