import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatDuration } from '../src/domain/format';
import { singleActiveTrip } from '../src/domain/itinerary';
import { groupTrips, outboundRoute, tripDurationDays, type Trip } from '../src/domain/trip';
import { DestinationCover } from '../src/features/trips/DestinationCover';
import { queryView } from '../src/hooks/queryView';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { useNow } from '../src/hooks/useNow';
import { listTripItems, TRIP_ITEM_TABLES } from '../src/repositories/tripItems';
import { listTrips, TRIP_TABLES } from '../src/repositories/trips';
import { Button } from '../src/ui/components/Button';
import { HeaderAction } from '../src/ui/components/HeaderAction';
import { Icon } from '../src/ui/components/Icon';
import { ListRow, Rows } from '../src/ui/components/ListRow';
import { LoadFailed, StaleNotice } from '../src/ui/components/QueryStates';
import { Screen } from '../src/ui/components/Screen';
import { ScreenHeader } from '../src/ui/components/ScreenHeader';
import { SectionLabel } from '../src/ui/components/SectionLabel';
import { gutter, spacing, type, useColors } from '../src/ui/tokens';

/**
 * Module scope, not state: jump into the active trip once per launch, not every time Home is
 * shown again — coming back to Home must not bounce you straight back out.
 */
let openedActiveTrip = false;

/** Your trips (B6): the next one as a cover, the others as rows, and the backup one tap away. */
export default function Home() {
  const c = useColors();
  const router = useRouter();
  const now = useNow();
  const tripsQuery = useLiveQuery(listTrips, TRIP_TABLES);
  const trips = tripsQuery.data;
  const view = queryView(tripsQuery);

  const grouped = useMemo(() => groupTrips(trips ?? [], now), [trips, now]);
  const [cover, ...laterTrips] = grouped.upcoming;

  // Only the cover trip's journeys are read, for its route.
  const coverId = cover?.id;
  const { data: coverItems } = useLiveQuery(
    useCallback(
      async (database) => (coverId ? listTripItems(database, coverId) : []),
      [coverId],
    ),
    TRIP_ITEM_TABLES,
    [coverId],
  );
  const route = useMemo(() => outboundRoute(coverItems ?? []), [coverItems]);

  useEffect(() => {
    if (openedActiveTrip || !trips) return;
    openedActiveTrip = true;
    const active = singleActiveTrip(trips);
    if (active) router.push(`/trip/${active.id}`);
  }, [trips, router]);

  const open = (trip: Trip) => router.push(`/trip/${trip.id}`);
  const tripRow = (trip: Trip) => (
    <ListRow
      key={trip.id}
      title={trip.name}
      subtitle={`${formatDateRange(trip.startDate, trip.endDate)} · ${formatDuration(
        tripDurationDays(trip),
      )}`}
      detail={trip.destination}
      onPress={() => open(trip)}
    />
  );

  return (
    <Screen>
      <ScreenHeader
        title="Your trips"
        leading={false}
        action={
          <HeaderAction icon="add" label="New trip" onPress={() => router.push('/trip/new')} />
        }
      />

      {view === 'loading' ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : view === 'failed' ? (
        // Never "No trips yet" — that offers a restore over data that is only unreadable for now.
        <View style={styles.centre}>
          <LoadFailed what="your trips" onRetry={tripsQuery.refetch} />
        </View>
      ) : view === 'empty' ? (
        <View style={styles.centre}>
          <Text style={[type.title, styles.centred, { color: c.text }]}>No trips yet</Text>
          <Text style={[type.body, styles.centred, styles.emptyBody, { color: c.textMuted }]}>
            Add a trip and everything for it — tickets, bookings, places — lives in one place.
          </Text>
          <View style={styles.emptyAction}>
            <Button label="Add your first trip" onPress={() => router.push('/trip/new')} />
          </View>
          <Button
            label="Restore from a backup"
            variant="ghost"
            onPress={() => router.push('/backup')}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <StaleNotice queries={[tripsQuery]} />

          {cover ? (
            <View style={styles.section}>
              <SectionLabel>Upcoming</SectionLabel>
              <DestinationCover trip={cover} route={route} now={now} onPress={() => open(cover)} />
              {laterTrips.length > 0 ? <Rows>{laterTrips.map(tripRow)}</Rows> : null}
            </View>
          ) : null}

          {grouped.past.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>Past trips</SectionLabel>
              <Rows>{grouped.past.map(tripRow)}</Rows>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionLabel>Your data</SectionLabel>
            <Rows>
              <ListRow
                title="Lists & templates"
                subtitle="Packing and shopping lists to copy into a trip"
                leading={<Icon name="lists" color={c.accentText} />}
                onPress={() => router.push('/lists')}
              />
              <ListRow
                title="Travellers"
                subtitle="The people you travel with, chosen per trip"
                leading={<Icon name="travellers" color={c.accentText} />}
                onPress={() => router.push('/travellers')}
              />
              <ListRow
                title="Backup & restore"
                subtitle="Everything lives only on this phone. Save a copy before each trip."
                leading={<Icon name="backup" color={c.accentText} />}
                onPress={() => router.push('/backup')}
              />
            </Rows>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.sm },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  centred: { textAlign: 'center' },
  emptyBody: { maxWidth: 300 },
  emptyAction: { marginTop: spacing.lg },
});
