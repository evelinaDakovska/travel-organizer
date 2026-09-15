import { StyleSheet, Text } from 'react-native';

import { formatDateRange, formatDuration } from '../../domain/format';
import { isTripActive, tripDurationDays, type Trip } from '../../domain/trip';
import { Card } from '../../ui/components/Card';
import { Tag } from '../../ui/components/Tag';
import { spacing, type, useColors } from '../../ui/tokens';

/** The trip's own facts — dates, who is going, its notes — at the bottom of Now. */
export function TripSummary({ trip }: { trip: Trip }) {
  const c = useColors();

  const travellers =
    trip.travellers.length > 0
      ? `With ${trip.travellers.join(', ')}`
      : trip.travellerCount
        ? `${trip.travellerCount} people`
        : null;

  return (
    <Card style={styles.card}>
      {isTripActive(trip) ? <Tag label="Happening now" tone="accent" /> : null}
      <Text style={[type.title, { color: c.text }]}>
        {formatDateRange(trip.startDate, trip.endDate)}
      </Text>
      <Text style={[type.body, { color: c.textMuted }]}>
        {formatDuration(tripDurationDays(trip))}
        {trip.destination ? ` · ${trip.destination}` : ''}
      </Text>
      {travellers ? <Text style={[type.body, { color: c.text }]}>{travellers}</Text> : null}
      {trip.notes ? <Text style={[type.body, { color: c.text }]}>{trip.notes}</Text> : null}
      <Text style={[type.caption, { color: c.textMuted }]}>
        Times shown in {trip.defaultTz} unless an item says otherwise
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.xs },
});
