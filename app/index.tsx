import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { groupTrips } from '../src/domain/trip';
import { listTrips, TRIP_TABLES } from '../src/repositories/trips';
import { Screen } from '../src/ui/components/Screen';
import { TripCard } from '../src/ui/components/TripCard';
import { radius, spacing, type, useColors } from '../src/ui/tokens';

export default function Home() {
  const c = useColors();
  const router = useRouter();
  const { data: trips, error, loading } = useLiveQuery(listTrips, TRIP_TABLES);

  const grouped = useMemo(() => groupTrips(trips ?? []), [trips]);
  const isEmpty = !loading && (trips?.length ?? 0) === 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[type.display, { color: c.text }]}>Trips</Text>
        <Pressable
          onPress={() => router.push('/trip/new')}
          hitSlop={12}
          style={({ pressed }) => [
            styles.add,
            { backgroundColor: c.accent, opacity: pressed ? 0.75 : 1 },
          ]}>
          <Text style={[styles.addGlyph, { color: c.onAccent }]}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.danger }]}>Could not load trips</Text>
          <Text style={[type.caption, styles.errorDetail, { color: c.textMuted }]}>
            {error.message}
          </Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.centre}>
          <Text style={[type.title, styles.emptyTitle, { color: c.text }]}>No trips yet</Text>
          <Text style={[type.body, styles.emptyBody, { color: c.textMuted }]}>
            Add a trip and everything for it — tickets, bookings, places — lives in one place.
          </Text>
          <Pressable
            onPress={() => router.push('/trip/new')}
            style={({ pressed }) => [
              styles.emptyAction,
              { backgroundColor: c.accentSoft, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={[type.heading, { color: c.accent }]}>Add your first trip</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {grouped.upcoming.length > 0 && (
            <View style={styles.section}>
              <Text style={[type.overline, { color: c.textFaint }]}>UPCOMING</Text>
              {grouped.upcoming.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onPress={() => router.push(`/trip/${trip.id}`)}
                />
              ))}
            </View>
          )}

          {grouped.past.length > 0 && (
            <View style={styles.section}>
              <Text style={[type.overline, { color: c.textFaint }]}>PAST</Text>
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
  add: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  addGlyph: { fontSize: 28, lineHeight: 32, fontWeight: '400' },
  content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xxl },
  section: { gap: spacing.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', maxWidth: 300, lineHeight: 22 },
  emptyAction: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  errorDetail: { textAlign: 'center' },
});
