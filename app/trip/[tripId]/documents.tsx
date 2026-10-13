import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { tripDocuments, type Resource } from '../../../src/domain/resource';
import { itemsInTimelineOrder } from '../../../src/domain/timeline';
import { openResource } from '../../../src/features/resources/open';
import { ResourceList } from '../../../src/features/resources/ResourceList';
import { ResourceRow } from '../../../src/features/resources/ResourceRow';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
  listResources,
  RESOURCE_TABLES,
} from '../../../src/repositories/resources';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Rows } from '../../../src/ui/components/ListRow';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { gutter, spacing, type, useColors } from '../../../src/ui/tokens';

/**
 * Every document in the trip in one list (B11, N1): tickets first, then what belongs to the whole
 * trip, then each item's, in itinerary order. For "I know I have the Belvedere tickets somewhere".
 */
export default function TripDocumentsScreen() {
  const c = useColors();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const tripDocsQuery = useLiveQuery(
    useCallback((database) => listResources(database, { scope: 'trip', id: tripId }), [tripId]),
    RESOURCE_TABLES,
    [tripId],
  );
  const itemDocsQuery = useLiveQuery(
    useCallback((database) => listItemResourcesForTrip(database, tripId), [tripId]),
    ITEM_RESOURCE_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  const documents = useMemo(
    () =>
      tripDocuments(
        tripDocsQuery.data ?? [],
        itemDocsQuery.data ?? [],
        itemsInTimelineOrder(itemsQuery.data ?? []),
      ),
    [tripDocsQuery.data, itemDocsQuery.data, itemsQuery.data],
  );

  const trip = tripQuery.data;
  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Trip documents"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }

  const queries = [tripDocsQuery, itemDocsQuery, itemsQuery];
  const views = [queryView(tripDocsQuery), queryView(itemDocsQuery), queryView(itemsQuery)];
  const failed = views.includes('failed');
  const loading = views.includes('loading');

  const row = (resource: Resource, context?: string | null) => (
    <ResourceRow
      key={resource.id}
      resource={resource}
      context={context}
      onPress={() => void openResource(resource)}
      onEdit={() =>
        router.push({ pathname: '/resource/[resourceId]', params: { resourceId: resource.id } })
      }
    />
  );

  return (
    <Screen>
      <ScreenHeader title="Trip documents" subtitle={trip.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={queries} />
        {/* A read that failed is never "no documents" — the ticket may be in it. */}
        {failed ? (
          <LoadFailed what="the documents" onRetry={() => queries.forEach((q) => q.refetch())} />
        ) : loading ? (
          <Text style={[type.body, { color: c.textMuted }]}>Loading…</Text>
        ) : (
          <>
            {documents.tickets.length > 0 ? (
              <View style={styles.section}>
                <SectionLabel>Tickets</SectionLabel>
                <Rows>
                  {documents.tickets.map(({ resource, item }) =>
                    row(resource, item?.title ?? 'For the whole trip'),
                  )}
                </Rows>
              </View>
            ) : null}

            {/* The trip's own documents, with the buttons that add more. */}
            <ResourceList
              owner={{ scope: 'trip', id: trip.id }}
              resources={documents.forTrip}
              title="For the whole trip"
              emptyText="Insurance, passport scans, visas — anything that belongs to the whole trip."
            />

            {documents.byItem.map(({ item, resources }) => (
              <View key={item.id} style={styles.section}>
                <SectionLabel>{item.title}</SectionLabel>
                <Rows>{resources.map((resource) => row(resource))}</Rows>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.xs },
});
