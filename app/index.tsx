import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { singleActiveTrip } from '../src/domain/itinerary';
import { groupTrips } from '../src/domain/trip';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { listTrips, TRIP_TABLES } from '../src/repositories/trips';
import { Button } from '../src/ui/components/Button';
import { Icon } from '../src/ui/components/Icon';
import { Screen } from '../src/ui/components/Screen';
import { SectionLabel } from '../src/ui/components/SectionLabel';
import { TripCard } from '../src/ui/components/TripCard';
import { elevation, radius, spacing, type, useColors } from '../src/ui/tokens';

/**
 * Module scope, not state: jump into the active trip once per launch, not every time Home is
 * shown again — coming back to Home must not bounce you straight back out.
 */
let openedActiveTrip = false;

export default function Home() {
  const c = useColors();
  const router = useRouter();
  const { data: trips, error, loading } = useLiveQuery(listTrips, TRIP_TABLES);

  const grouped = useMemo(() => groupTrips(trips ?? []), [trips]);
  const isEmpty = !loading && (trips?.length ?? 0) === 0;

  useEffect(() => {
    if (openedActiveTrip || !trips) return;
    openedActiveTrip = true;
    const active = singleActiveTrip(trips);
    if (active) router.push(`/trip/${active.id}`);
  }, [trips, router]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[type.display, { color: c.text }]} accessibilityRole="header">
          Trips
        </Text>
        <Pressable
          onPress={() => router.push('/trip/new')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New trip"
          style={({ pressed }) => [
            styles.add,
            elevation.md,
            { backgroundColor: pressed ? c.accentPressed : c.accent, shadowColor: c.shadow },
          ]}>
          <Icon name="add" size={26} color={c.onAccent} strokeWidth={2.75} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Text style={[type.bodyStrong, { color: c.danger }]}>Could not load trips</Text>
          <Text style={[type.caption, styles.centred, { color: c.textMuted }]}>{error.message}</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.centre}>
          <Text style={[type.title, styles.centred, { color: c.text }]}>No trips yet</Text>
          <Text style={[type.body, styles.centred, styles.emptyBody, { color: c.textMuted }]}>
            Add a trip and everything for it — tickets, bookings, places — lives in one place.
          </Text>
          <View style={styles.emptyAction}>
            <Button label="Add your first trip" onPress={() => router.push('/trip/new')} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {grouped.upcoming.length > 0 && (
            <View style={styles.section}>
              <SectionLabel>Upcoming</SectionLabel>
              {grouped.upcoming.map((trip) => (
                <TripCard key={trip.id} trip={trip} onPress={() => router.push(`/trip/${trip.id}`)} />
              ))}
            </View>
          )}

          {grouped.past.length > 0 && (
            <View style={styles.section}>
              <SectionLabel>Past</SectionLabel>
              {grouped.past.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  muted
                  onPress={() => router.push(`/trip/${trip.id}`)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  add: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xxl, paddingBottom: spacing.xxxl },
  section: { gap: spacing.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  centred: { textAlign: 'center' },
  emptyBody: { maxWidth: 300 },
  emptyAction: { marginTop: spacing.lg },
});
