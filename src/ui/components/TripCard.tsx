import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatDuration } from '../../domain/format';
import { isTripActive, tripDurationDays, type Trip } from '../../domain/trip';
import { radius, spacing, type, useColors } from '../tokens';

type Props = { trip: Trip; onPress: () => void; muted?: boolean };

export function TripCard({ trip, onPress, muted = false }: Props) {
  const c = useColors();
  const active = isTripActive(trip);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: active ? c.accent : c.border,
          opacity: pressed ? 0.7 : muted ? 0.72 : 1,
        },
      ]}>
      {active && (
        <Text style={[type.overline, styles.badge, { color: c.accent }]}>HAPPENING NOW</Text>
      )}

      <Text style={[type.title, { color: c.text }]} numberOfLines={2}>
        {trip.name}
      </Text>

      {trip.destination ? (
        <Text style={[type.body, { color: c.textMuted }]} numberOfLines={1}>
          {trip.destination}
        </Text>
      ) : null}

      <View style={styles.meta}>
        <Text style={[type.body, { color: c.text }]}>
          {formatDateRange(trip.startDate, trip.endDate)}
        </Text>
        <Text style={[type.body, { color: c.textFaint }]}>·</Text>
        <Text style={[type.body, { color: c.textMuted }]}>
          {formatDuration(tripDurationDays(trip))}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  badge: { marginBottom: spacing.sm },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
});
