import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateRange, formatDuration } from '../../../src/domain/format';
import { isTripActive, tripDurationDays } from '../../../src/domain/trip';
import { ResourceList } from '../../../src/features/resources/ResourceList';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listResources, RESOURCE_TABLES } from '../../../src/repositories/resources';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { Card } from '../../../src/ui/components/Card';
import { ItemRow } from '../../../src/ui/components/ItemRow';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { Tag } from '../../../src/ui/components/Tag';
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

  const { data: items } = useLiveQuery(
    useCallback((db) => listTripItems(db, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  const { data: documents } = useLiveQuery(
    useCallback((db) => listResources(db, { scope: 'trip', id: tripId }), [tripId]),
    RESOURCE_TABLES,
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
          <Pressable
            onPress={() => router.push(`/trip/${trip.id}/edit`)}
            hitSlop={12}
            accessibilityRole="button">
            <Text style={[type.bodyStrong, { color: c.accentText }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.summary}>
          {isTripActive(trip) ? <Tag label="Happening now" tone="accent" /> : null}
          <Text style={[type.title, { color: c.text }]}>
            {formatDateRange(trip.startDate, trip.endDate)}
          </Text>
          <Text style={[type.body, { color: c.textMuted }]}>
            {formatDuration(tripDurationDays(trip))}
            {trip.destination ? ` · ${trip.destination}` : ''}
          </Text>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Times shown in {trip.defaultTz} unless an item says otherwise
          </Text>
        </Card>

        {(trip.travellers.length > 0 || trip.travellerCount) && (
          <View style={styles.block}>
            <SectionLabel>Travelling</SectionLabel>
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
            <SectionLabel>Notes</SectionLabel>
            <Text style={[type.body, { color: c.text }]}>{trip.notes}</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <SectionLabel>Everything in this trip</SectionLabel>

          {items && items.length > 0 ? (
            <View style={styles.list}>
              {items.map((item) => (
                <ItemRow key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
              ))}
            </View>
          ) : (
            <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
              <Text style={[type.body, { color: c.textMuted }]}>
                Nothing here yet. Add a flight, a hotel, or somewhere you want to go.
              </Text>
            </View>
          )}

          <Button
            label="Add something"
            variant="secondary"
            onPress={() => router.push(`/item/new?tripId=${trip.id}`)}
          />
        </View>

        <ResourceList
          owner={{ scope: 'trip', id: trip.id }}
          resources={documents ?? []}
          title="Trip documents"
          emptyText="Insurance, passport scans, visas — anything that belongs to the whole trip."
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: spacing.xxxl },
  summary: { padding: spacing.xl, gap: spacing.xs },
  block: { gap: spacing.md },
  list: { gap: spacing.md },
  well: { borderRadius: radius.lg, padding: spacing.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
