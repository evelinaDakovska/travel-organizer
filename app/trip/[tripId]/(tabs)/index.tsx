import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  doneTasks,
  happeningNote,
  nowSections,
  openTasks,
  todayNote,
} from '../../../../src/domain/itinerary';
import { paymentStatuses, type PaymentStatus } from '../../../../src/domain/bookingCosts';
import type { TimelineEntry } from '../../../../src/domain/timeline';
import type { TripItem } from '../../../../src/domain/tripItem';
import { groupResourcesByItem, type Resource } from '../../../../src/domain/resource';
import { ResourceList } from '../../../../src/features/resources/ResourceList';
import { TimelineRow } from '../../../../src/features/timeline/TimelineRow';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { TaskRow } from '../../../../src/features/trips/TaskRow';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { TripBand } from '../../../../src/features/trips/TripBand';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { useNow } from '../../../../src/hooks/useNow';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
  listResources,
  RESOURCE_TABLES,
} from '../../../../src/repositories/resources';
import {
  listTripItems,
  setTaskCompleted,
  TRIP_ITEM_TABLES,
} from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Icon } from '../../../../src/ui/components/Icon';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { opacity, spacing, type, useColors } from '../../../../src/ui/tokens';

export default function NowScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const now = useNow();
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
  const documentsQuery = useLiveQuery(
    useCallback((database) => listResources(database, { scope: 'trip', id: tripId }), [tripId]),
    RESOURCE_TABLES,
    [tripId],
  );
  const trip = tripQuery.data;
  const items = itemsQuery.data;
  const attachments = attachmentsQuery.data;
  const documents = documentsQuery.data;

  const sections = useMemo(() => nowSections(items ?? [], now), [items, now]);
  const tasks = useMemo(() => openTasks(items ?? []), [items]);
  const done = useMemo(() => doneTasks(items ?? []), [items]);
  // Done tasks are one tap away, folded by default and not remembered (F3).
  const [showDone, setShowDone] = useState(false);
  const byItem = useMemo(() => groupResourcesByItem(attachments ?? []), [attachments]);
  const payments = useMemo(() => paymentStatuses(items ?? []), [items]);

  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip) {
    return (
      <QueryScreen
        title="Now"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }
  const itemsFailed = queryView(itemsQuery) === 'failed';
  // Until the first read lands, an empty task list would say "Nothing left to do" (A5).
  const itemsLoading = queryView(itemsQuery) === 'loading';

  return (
    <Screen>
      <ScreenHeader
        title="Now"
        subtitle={trip.name}
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={trip.id} />
            <Pressable
              onPress={() => router.push(`/trip/${trip.id}/edit`)}
              hitSlop={12}
              accessibilityRole="button">
              <Text style={[type.bodyStrong, { color: c.accentText }]}>Edit</Text>
            </Pressable>
          </View>
        }
      />

      {/* Outside the list: the trip stays in view while it scrolls (F3). */}
      <TripBand trip={trip} now={now} />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[tripQuery, itemsQuery, attachmentsQuery, documentsQuery]} />
        {itemsFailed ? <LoadFailed what="this trip's plans" onRetry={itemsQuery.refetch} /> : null}
        {/* Without them every Open button would silently vanish, as if nothing were attached. */}
        {queryView(attachmentsQuery) === 'failed' ? (
          <LoadFailed what="the attachments" onRetry={attachmentsQuery.refetch} />
        ) : null}

        {/* The thing you are late for first, then today's plans without a time, then what is next. */}
        <NowSection
          label="Happening now"
          entries={sections.happening}
          byItem={byItem}
          payments={payments}
          noteFor={(item) => happeningNote(item, now)}
        />
        <NowSection
          label="Today, no fixed time"
          entries={sections.today}
          byItem={byItem}
          payments={payments}
          noteFor={(item) => todayNote(item, now)}
        />
        <NowSection
          label="Maybe today"
          entries={sections.maybeToday}
          byItem={byItem}
          payments={payments}
          noteFor={(item) => todayNote(item, now)}
        />
        <NowSection
          label="Up next"
          entries={sections.upNext}
          byItem={byItem}
          payments={payments}
          showDate
        />

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <SectionLabel>Open tasks</SectionLabel>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/item/new', params: { tripId: trip.id, kind: 'task' } })
              }
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Add a task"
              style={({ pressed }) => [styles.addTask, { opacity: pressed ? opacity.pressed : 1 }]}>
              <Icon name="add" size={18} color={c.accentText} strokeWidth={2.5} />
              <Text style={[type.bodyStrong, { color: c.accentText }]}>Add</Text>
            </Pressable>
          </View>
          {itemsFailed ? null : itemsLoading ? (
            <Text style={[type.body, { color: c.textMuted }]}>Loading…</Text>
          ) : tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => setTaskCompleted(db, task.id, true)}
                onPress={() => router.push(`/item/${task.id}`)}
              />
            ))
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>
              {done.length > 0 ? 'All done.' : 'Nothing left to do.'}
            </Text>
          )}
          {!itemsFailed && done.length > 0 ? (
            <Pressable
              onPress={() => setShowDone((shown) => !shown)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDone }}
              style={({ pressed }) => [styles.showDone, { opacity: pressed ? opacity.pressed : 1 }]}>
              <Text style={[type.bodyStrong, { color: c.accentText }]}>
                {showDone ? 'Hide done' : `Show done (${done.length})`}
              </Text>
              <Icon name={showDone ? 'expand' : 'forward'} size={16} color={c.accentText} />
            </Pressable>
          ) : null}
          {showDone
            ? done.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => setTaskCompleted(db, task.id, false)}
                  onPress={() => router.push(`/item/${task.id}`)}
                />
              ))
            : null}
        </View>

        {queryView(documentsQuery) === 'failed' ? (
          <View style={styles.section}>
            <SectionLabel>Trip documents</SectionLabel>
            <LoadFailed what="the trip documents" onRetry={documentsQuery.refetch} />
          </View>
        ) : (
          <ResourceList
            owner={{ scope: 'trip', id: trip.id }}
            resources={documents ?? []}
            title="Trip documents"
            emptyText={
              documents
                ? 'Insurance, passport scans, visas — anything that belongs to the whole trip.'
                : undefined
            }
          />
        )}

        {/* The rest of the old This trip card; dates and the rest are in the band above. */}
        {trip.notes ? (
          <View style={styles.section}>
            <SectionLabel>Trip notes</SectionLabel>
            <Text style={[type.body, { color: c.text }]}>{trip.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** One of Now's lists of entries. Nothing at all when it is empty. */
function NowSection({
  label,
  entries,
  byItem,
  payments,
  noteFor,
  showDate = false,
}: {
  label: string;
  entries: readonly TimelineEntry<TripItem>[];
  byItem: ReadonlyMap<string, Resource[]>;
  payments: ReadonlyMap<string, PaymentStatus>;
  noteFor?: (item: TripItem) => string | null;
  showDate?: boolean;
}) {
  const router = useRouter();
  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionLabel>{label}</SectionLabel>
      {entries.map((entry) => (
        <TimelineRow
          key={entry.key}
          entry={entry}
          resources={byItem.get(entry.item.id) ?? []}
          showDate={showDate}
          note={noteFor?.(entry.item)}
          payment={payments.get(entry.item.id) ?? null}
          onPress={() => router.push(`/item/${entry.item.id}`)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  // Room at the bottom for the floating add button.
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: 120 },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addTask: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  showDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
