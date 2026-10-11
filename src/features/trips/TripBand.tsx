import { StyleSheet, Text, View } from 'react-native';

import { formatDateRange } from '../../domain/format';
import { timezoneLabel } from '../../domain/timezones';
import { tripPhase, tripPhaseLabel, type Trip } from '../../domain/trip';
import { spacing, type, useColors } from '../../ui/tokens';

/**
 * The trip, always in view at the top of Now (F3): where and when on one line, then how far into
 * it, the zone times are read in, and who is going. Sits outside the list, so it does not scroll.
 */
export function TripBand({ trip, now }: { trip: Trip; now: Date }) {
  const c = useColors();
  const travellers = trip.travellers.length > 0 ? trip.travellers.join(', ') : null;
  const details = [
    tripPhaseLabel(tripPhase(trip, now)),
    `${timezoneLabel(trip.defaultTz)} time`,
    travellers,
  ].filter(Boolean);

  return (
    <View
      style={[styles.band, { backgroundColor: c.surfaceSunken, borderColor: c.border }]}
      accessibilityRole="summary">
      <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
        {trip.destination ?? trip.name} · {formatDateRange(trip.startDate, trip.endDate)}
      </Text>
      <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
        {details.join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
