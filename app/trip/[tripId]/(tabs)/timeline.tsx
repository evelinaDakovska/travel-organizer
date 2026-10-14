import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { paymentStatuses } from '../../../../src/domain/bookingCosts';
import {
  dayStops,
  daysForStop,
  defaultStopKey,
  resolveStopKey,
  stopDescription,
  stopKey,
  stopLabels,
  tripDates,
} from '../../../../src/domain/dayRail';
import { formatDateRange, formatDayHeading } from '../../../../src/domain/format';
import { undatedConfirmed } from '../../../../src/domain/itinerary';
import { groupResourcesByItem } from '../../../../src/domain/resource';
import { buildTimeline } from '../../../../src/domain/timeline';
import { dayKey } from '../../../../src/domain/time';
import { deviceToday } from '../../../../src/domain/trip';
import {
  findStayForDay,
  findTimelineConnectors,
  findTripSavedPlaces,
  findTripStays,
  type TimelineConnector,
} from '../../../../src/domain/directions';
import { DirectionsSheet } from '../../../../src/features/directions/DirectionsSheet';
import { AddSheet } from '../../../../src/features/items/AddSheet';
import { TimelineConnectorRow } from '../../../../src/features/timeline/TimelineConnectorRow';
import { TimelineRow } from '../../../../src/features/timeline/TimelineRow';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { useNow } from '../../../../src/hooks/useNow';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
} from '../../../../src/repositories/resources';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Button } from '../../../../src/ui/components/Button';
import { DateRail } from '../../../../src/ui/components/DateRail';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { Rows } from '../../../../src/ui/components/ListRow';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { Tag } from '../../../../src/ui/components/Tag';
import { gutter, radius, spacing, type, useColors } from '../../../../src/ui/tokens';

/** Longer than this, the rail also offers a calendar to jump to a day (B3). */
const RAIL_CALENDAR_AFTER_DAYS = 7;

export default function TimelineScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

  const tripQuery = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const attachmentsQuery = useLiveQuery(
    useCallback((database) => listItemResourcesForTrip(database, tripId), [tripId]),
    ITEM_RESOURCE_TABLES,
    [tripId],
  );

  const trip = tripQuery.data;
  const items = itemsQuery.data;
  const attachments = attachmentsQuery.data;

  // Cancelled items never reach the timeline; dated ideas stay on their day (decision log D22).
  const days = useMemo(() => buildTimeline(items ?? []), [items]);
  const undated = useMemo(() => undatedConfirmed(items ?? []), [items]);
  const byItem = useMemo(() => groupResourcesByItem(attachments ?? []), [attachments]);
  // Paid or not (F7), a journey's legs sharing the state of the one that holds the price.
  const payments = useMemo(() => paymentStatuses(items ?? []), [items]);

  const today = deviceToday(useNow());
  // Only a tap changes the day shown: a refresh or an edit elsewhere never moves the reader (B3).
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [activeConnector, setActiveConnector] = useState<TimelineConnector | null>(null);

  const stays = useMemo(() => findTripStays(items ?? []), [items]);
  const savedPlaces = useMemo(() => findTripSavedPlaces(items ?? []), [items]);

  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Timeline"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }
  const itemsFailed = queryView(itemsQuery) === 'failed';
  const itemsLoading = queryView(itemsQuery) === 'loading';

  const stops = dayStops(
    trip,
    days.map((day) => day.day),
    undated.length > 0,
  );
  const selectedKey = resolveStopKey(stops, chosen, defaultStopKey(trip, today));
  const selected = stops.find((stop) => stopKey(stop) === selectedKey)!;
  const shownDays = daysForStop(selected, days, trip);
  const duringTrip = trip.startDate <= today && today <= trip.endDate;
  const dayNumber = new Map(
    stops.flatMap((stop) => (stop.kind === 'day' ? [[stop.date, stop.number] as const] : [])),
  );

  const open = (itemId: string) => router.push(`/item/${itemId}`);
  // On a day, what is added is planned for that day (B3); the kind is asked first (B10).
  const addDate = selected.kind === 'day' ? selected.date : undefined;

  return (
    <Screen>
      <ScreenHeader
        title="Timeline"
        subtitle={`${trip.name} · ${formatDateRange(trip.startDate, trip.endDate)}`}
        action={
          <View style={styles.headerActions}>
            {duringTrip && selectedKey !== today ? (
              <HeaderAction label="Today" onPress={() => setChosen(today)} />
            ) : null}
            <SearchButton tripId={tripId} />
            <HeaderAction
              icon="add"
              label="Add"
              accessibilityLabel="Add to this trip"
              onPress={() => setAdding(true)}
            />
          </View>
        }
      />

      <DateRail
        stops={stops.map((stop) => ({
          key: stopKey(stop),
          ...stopLabels(stop),
          today: stop.kind === 'day' && stop.date === today,
          accessibilityLabel: stopDescription(stop, today),
        }))}
        selected={selectedKey}
        onSelect={setChosen}
        pickRange={
          tripDates(trip).length > RAIL_CALENDAR_AFTER_DAYS
            ? { first: trip.startDate, last: trip.endDate }
            : undefined
        }
        onPickDate={setChosen}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[tripQuery, itemsQuery, attachmentsQuery]} />
        {/* A read that failed is not an empty trip, and must not say it is. */}
        {itemsFailed ? <LoadFailed what="the timeline" onRetry={itemsQuery.refetch} /> : null}
        {queryView(attachmentsQuery) === 'failed' ? (
          <LoadFailed what="the attachments" onRetry={attachmentsQuery.refetch} />
        ) : null}

        {itemsFailed || itemsLoading ? null : selected.kind === 'undated' ? (
          <View style={styles.section}>
            <SectionLabel>No date yet</SectionLabel>
            <Rows>
              {undated.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  payment={payments.get(item.id) ?? null}
                  onPress={() => open(item.id)}
                />
              ))}
            </Rows>
          </View>
        ) : shownDays.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
            <Text style={[type.body, { color: c.textMuted }]}>
              {selected.kind === 'day'
                ? 'Nothing planned for this day yet.'
                : 'Nothing on the timeline yet. Anything with a date appears here, day by day.'}
            </Text>
            <Button label="Add a plan" variant="secondary" onPress={() => setAdding(true)} />
          </View>
        ) : (
          shownDays.map((day) => {
            const number = dayNumber.get(day.day);
            const connectors = findTimelineConnectors(day.entries);
            const connectorByToId = new Map(connectors.map((conn) => [conn.toItem.id, conn]));

            return (
              <View key={day.day} style={styles.section}>
                <View style={styles.dayHead}>
                  <SectionLabel>{formatDayHeading(day.day)}</SectionLabel>
                  {number ? (
                    <Text style={[type.caption, { color: c.textMuted }]}>Day {number}</Text>
                  ) : null}
                  {day.day === today ? <Tag label="Today" tone="accent" /> : null}
                </View>
                <Rows>
                  {day.entries.flatMap((entry) => {
                    const conn = connectorByToId.get(entry.item.id);
                    const elements = [];
                    if (conn) {
                      elements.push(
                        <TimelineConnectorRow
                          key={`conn-${conn.id}`}
                          connector={conn}
                          onPress={() => setActiveConnector(conn)}
                        />,
                      );
                    }
                    elements.push(
                      <TimelineRow
                        key={entry.key}
                        entry={entry}
                        resources={byItem.get(entry.item.id) ?? []}
                        payment={payments.get(entry.item.id) ?? null}
                        onPress={() => open(entry.item.id)}
                      />,
                    );
                    return elements;
                  })}
                </Rows>
              </View>
            );
          })
        )}
      </ScrollView>

      <AddSheet
        visible={adding}
        onClose={() => setAdding(false)}
        tripId={tripId}
        date={addDate}
      />

      {activeConnector ? (
        <DirectionsSheet
          visible={activeConnector !== null}
          onClose={() => setActiveConnector(null)}
          destination={activeConnector.destination}
          initialOrigin={{ type: 'endpoint', endpoint: activeConnector.origin }}
          previousEndpoint={activeConnector.origin}
          hotel={findStayForDay(stays, activeConnector.day)}
          savedPlaces={savedPlaces}
          requestKey={activeConnector.id}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  dayHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  empty: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
