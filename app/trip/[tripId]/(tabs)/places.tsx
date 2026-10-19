import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { bookedPlaces, byPriority } from '../../../../src/domain/places';
import type { Priority } from '../../../../src/domain/tripItem';
import { AddSheet } from '../../../../src/features/items/AddSheet';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { TripTabHeader } from '../../../../src/features/trips/TripTabHeader';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import {
  listPlaces,
  listTripItems,
  TRIP_ITEM_TABLES,
} from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Button } from '../../../../src/ui/components/Button';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { Rows } from '../../../../src/ui/components/ListRow';
import { LoadFailed, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { Segments } from '../../../../src/ui/components/Segments';
import { gutter, radius, spacing, type, useColors } from '../../../../src/ui/tokens';

type PlacesView = 'saved' | 'itinerary';

const VIEW_LABELS: Record<PlacesView, string> = { saved: 'Saved', itinerary: 'In itinerary' };

const PRIORITY_LABELS: Record<Priority, string> = { must: 'Must', want: 'Want', maybe: 'Maybe' };

/**
 * Places (B7): the ideas saved for this trip, most wanted first — opening one offers Add to
 * itinerary — and, on the other side, every planned item that says where it is (U5). Two views of
 * the same items; nothing here is a separate kind of thing.
 */
export default function PlacesScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();
  const [view, setView] = useState<PlacesView>('saved');
  const [adding, setAdding] = useState(false);

  const { data: trip } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const placesQuery = useLiveQuery(
    useCallback((database) => listPlaces(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const groups = useMemo(() => byPriority(placesQuery.data ?? []), [placesQuery.data]);
  const booked = useMemo(() => bookedPlaces(itemsQuery.data ?? []), [itemsQuery.data]);
  const open = (itemId: string) => router.push(`/item/${itemId}`);

  const shown = view === 'saved' ? placesQuery : itemsQuery;
  const shownView = queryView(shown);

  return (
    <Screen>
      <TripTabHeader
        title="Places"
        trip={trip}
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={tripId} />
            <HeaderAction
              icon="add"
              label="Add"
              accessibilityLabel="Save a place"
              onPress={() => setAdding(true)}
            />
          </View>
        }
      />
      <View style={styles.segments}>
        <Segments
          value={view}
          options={['saved', 'itinerary'] as const}
          labelFor={(option) => VIEW_LABELS[option]}
          onChange={setView}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[placesQuery, itemsQuery]} />
        {shownView === 'failed' ? (
          <LoadFailed
            what={view === 'saved' ? 'the saved places' : 'where your plans are'}
            onRetry={shown.refetch}
          />
        ) : shownView === 'loading' ? (
          <Text style={[type.body, { color: c.textMuted }]}>Loading…</Text>
        ) : view === 'saved' ? (
          groups.length > 0 ? (
            groups.map(({ priority, items }) => (
              <View key={priority ?? 'none'} style={styles.section}>
                <SectionLabel>{priority ? PRIORITY_LABELS[priority] : 'No priority'}</SectionLabel>
                <Rows>
                  {items.map((place) => (
                    <ItemRow
                      key={place.id}
                      item={place}
                      headingSays
                      showFinancials={false}
                      onPress={() => open(place.id)}
                    />
                  ))}
                </Rows>
              </View>
            ))
          ) : (
            <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
              <Text style={[type.body, { color: c.textMuted }]}>
                Nothing saved yet — a café someone recommended, a viewpoint.
              </Text>
              <Button label="Save a place" variant="secondary" onPress={() => setAdding(true)} />
            </View>
          )
        ) : booked.length > 0 ? (
          <Rows>
            {booked.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                showFinancials={false}
                onPress={() => open(item.id)}
              />
            ))}
          </Rows>
        ) : (
          <Text style={[type.body, { color: c.textMuted }]}>
            Plans with a place or an address are listed here.
          </Text>
        )}
      </ScrollView>

      <AddSheet visible={adding} onClose={() => setAdding(false)} tripId={tripId} idea />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  segments: { paddingHorizontal: gutter.normal },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.xs },
  empty: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
