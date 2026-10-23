import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatDuration } from '../../domain/format';
import { tripDurationDays, tripPhase, tripPhaseLabel, type Trip, type TripDates } from '../../domain/trip';
import { opacity, radius, spacing, type, useColors } from '../../ui/tokens';

/** Only ever a dated trip: one without dates is never the cover (P6-4). */
type Props = { trip: Trip & TripDates; route: string | null; now: Date; onPress: () => void };

/**
 * The trip that is next or under way, as a cover (B6): where, when, how far off and the way there.
 * Text only — no photo to download or go missing — and readable in both schemes.
 */
export function DestinationCover({ trip, route, now, onPress }: Props) {
  const c = useColors();
  const eyebrow = [trip.destination, tripPhaseLabel(tripPhase(trip, now))].filter(Boolean).join(' · ');
  const when = `${formatDateRange(trip.startDate, trip.endDate)} · ${formatDuration(
    tripDurationDays(trip),
  )}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[trip.name, eyebrow, when, route].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.cover,
        { backgroundColor: c.cover, opacity: pressed ? opacity.pressed : 1 },
      ]}>
      <Text style={[type.overline, { color: c.onCoverMuted }]}>{eyebrow.toUpperCase()}</Text>
      <Text style={[type.display, styles.name, { color: c.onCover }]}>{trip.name}</Text>
      <Text style={[type.body, { color: c.onCoverMuted }]}>{when}</Text>
      {route ? (
        <View style={[styles.route, { borderTopColor: c.onCoverMuted }]}>
          <Text style={[type.caption, { color: c.onCoverMuted }]}>{route}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.xs, minHeight: 180 },
  name: { marginTop: spacing.sm },
  route: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
