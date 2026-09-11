import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatDuration } from '../../../src/domain/format';
import { isTripActive, tripDurationDays } from '../../../src/domain/trip';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { radius, spacing, type, useColors } from '../../../src/ui/tokens';

export default function TripOverview() {
  const c = useColors();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const { data: trip, loading } = useLiveQuery(
    useCallback((db) => getTrip(db, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="" />
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <ScreenHeader title="Trip" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This trip no longer exists.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={trip.name}
        action={
          <Pressable onPress={() => router.push(`/trip/${trip.id}/edit`)} hitSlop={12}>
            <Text style={[type.body, { color: c.accent }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {isTripActive(trip) && (
          <Text style={[type.overline, { color: c.accent }]}>HAPPENING NOW</Text>
        )}

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[type.heading, { color: c.text }]}>
            {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
          <Text style={[type.body, { color: c.textMuted }]}>
            {formatDuration(tripDurationDays(trip))}
            {trip.destination ? ` · ${trip.destination}` : ''}
          </Text>
          <Text style={[type.caption, { color: c.textFaint }]}>
            Times shown in {trip.defaultTz} unless an item says otherwise
          </Text>
        </View>

        {(trip.travellers.length > 0 || trip.travellerCount) && (
          <View style={styles.block}>
            <Text style={[type.overline, { color: c.textFaint }]}>TRAVELLING</Text>
            <Text style={[type.body, { color: c.text }]}>
              {trip.travellers.length > 0
                ? trip.travellers.join(', ')
                : `${trip.travellerCount} people`}
              {trip.travellers.length > 0 && trip.travellerCount
                ? ` · ${trip.travellerCount} people`
                : ''}
            </Text>
          </View>
        )}

        {trip.notes ? (
          <View style={styles.block}>
            <Text style={[type.overline, { color: c.textFaint }]}>NOTES</Text>
            <Text style={[type.body, styles.notes, { color: c.text }]}>{trip.notes}</Text>
          </View>
        ) : null}

        <View
          style={[styles.placeholder, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}>
          <Text style={[type.body, { color: c.textMuted }]}>
            Bookings, timeline, places and documents arrive in the next milestones.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xs },
  block: { gap: spacing.sm },
  notes: { lineHeight: 22 },
  placeholder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
