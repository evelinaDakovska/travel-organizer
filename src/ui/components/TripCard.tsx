import { StyleSheet, Text } from 'react-native';

import { formatDateRange, formatDuration } from '../../domain/format';
import { isTripActive, tripDurationDays, type Trip } from '../../domain/trip';
import { spacing, type, useColors } from '../tokens';
import { Card } from './Card';
import { Tag } from './Tag';

type Props = { trip: Trip; onPress: () => void; muted?: boolean };

export function TripCard({ trip, onPress, muted = false }: Props) {
  const c = useColors();

  return (
    <Card onPress={onPress} accessibilityLabel={trip.name} style={[styles.card, muted && styles.muted]}>
      {isTripActive(trip) ? <Tag label="Happening now" tone="accent" /> : null}

      <Text style={[type.title, { color: c.text }]} numberOfLines={2}>
        {trip.name}
      </Text>

      {trip.destination ? (
        <Text style={[type.body, { color: c.textMuted }]} numberOfLines={1}>
          {trip.destination}
        </Text>
      ) : null}

      <Text style={[type.label, styles.dates, { color: c.text }]}>
        {formatDateRange(trip.startDate, trip.endDate)} · {formatDuration(tripDurationDays(trip))}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.xs },
  muted: { opacity: 0.72 },
  dates: { marginTop: spacing.sm },
});
