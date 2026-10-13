import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { paymentStatuses, type PaymentStatus } from '../../../../src/domain/bookingCosts';
import { formatDateRange, formatShortDate } from '../../../../src/domain/format';
import {
  doneTasks,
  entryRoleLabel,
  entryZoneLabel,
  happeningNote,
  openTasks,
  todayNote,
} from '../../../../src/domain/itinerary';
import {
  baseTonight,
  leadNote,
  overviewPlan,
  staysAndRentals,
  type LeadReason,
} from '../../../../src/domain/overview';
import { groupResourcesByItem, type Resource } from '../../../../src/domain/resource';
import { dayKey } from '../../../../src/domain/time';
import type { TimelineEntry } from '../../../../src/domain/timeline';
import { timezoneLabel } from '../../../../src/domain/timezones';
import { deviceToday, tripPhase, tripPhaseLabel } from '../../../../src/domain/trip';
import { routeLabel, transportDetails, type TripItem } from '../../../../src/domain/tripItem';
import { AddSheet } from '../../../../src/features/items/AddSheet';
import { OpenResource } from '../../../../src/features/resources/OpenResource';
import { TimelineRow } from '../../../../src/features/timeline/TimelineRow';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { TaskRow } from '../../../../src/features/trips/TaskRow';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { useNow } from '../../../../src/hooks/useNow';
import {
  ITEM_RESOURCE_TABLES,
  listItemResourcesForTrip,
} from '../../../../src/repositories/resources';
import {
  listTripItems,
  setTaskCompleted,
  TRIP_ITEM_TABLES,
} from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { Icon } from '../../../../src/ui/components/Icon';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { LeadPanel } from '../../../../src/ui/components/LeadPanel';
import { ListRow, Rows } from '../../../../src/ui/components/ListRow';
import { PaymentTag } from '../../../../src/ui/components/PaymentTag';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { UndoToast } from '../../../../src/ui/components/UndoToast';
import { gutter, spacing, type, useColors } from '../../../../src/ui/tokens';

const LEAD_EYEBROW: Record<LeadReason, string> = {
  happening: 'Happening now',
  next: 'Next',
  firstDeparture: 'Your first departure',
};

/**
 * The trip at a glance (B5). Before it: the countdown, the first departure, what is left to get
 * ready, where you will stay. During it: today, what is on now or next, today's flexible plans
 * and tonight's stay. Route `index`, labelled Overview.
 */
export default function OverviewScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const now = useNow();
  const tripId = useTripId();
  const [adding, setAdding] = useState(false);
  const [undo, setUndo] = useState<{ message: string; taskId: string } | null>(null);

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

  const plan = useMemo(
    () => (trip ? overviewPlan(items ?? [], trip, now) : null),
    [items, trip, now],
  );
  const tasks = useMemo(() => openTasks(items ?? []), [items]);
  const done = useMemo(() => doneTasks(items ?? []), [items]);
  const byItem = useMemo(
    () => groupResourcesByItem(attachmentsQuery.data ?? []),
    [attachmentsQuery.data],
  );
  const payments = useMemo(() => paymentStatuses(items ?? []), [items]);
  const today = deviceToday(now);
  const base = useMemo(() => baseTonight(items ?? [], today), [items, today]);
  const stays = useMemo(() => staysAndRentals(items ?? [], now), [items, now]);

  const tripView = queryView(tripQuery);
  if (tripView !== 'ready' || !trip || !plan) {
    return (
      <QueryScreen
        title="Overview"
        view={tripView}
        missingText="This trip no longer exists."
        what="this trip"
        onRetry={tripQuery.refetch}
      />
    );
  }
  const itemsView = queryView(itemsQuery);
  const itemsFailed = itemsView === 'failed';
  // Until the first read lands, nothing below may claim the trip is empty (A5).
  const itemsLoading = itemsView === 'loading';

  const phase = tripPhase(trip, now);
  const during = phase.phase === 'during';
  const travellers = trip.travellers.length > 0 ? trip.travellers.join(', ') : null;
  const meta = [`${timezoneLabel(trip.defaultTz)} time`, travellers].filter(Boolean).join(' · ');

  const toggle = (task: TripItem, completed: boolean) => {
    void setTaskCompleted(db, task.id, completed);
    setUndo(completed ? { message: `Done: ${task.title}`, taskId: task.id } : null);
  };
  const open = (itemId: string) => router.push(`/item/${itemId}`);

  const tasksSection = (
    <TasksSection
      label={during ? 'To do' : 'Get ready'}
      tasks={tasks}
      done={done}
      loading={itemsLoading}
      failed={itemsFailed}
      onToggle={toggle}
      onOpen={open}
      onAdd={() =>
        router.push({ pathname: '/item/new', params: { tripId: trip.id, kind: 'task' } })
      }
    />
  );

  return (
    <Screen>
      <ScreenHeader
        title={during ? formatShortDate(today) : trip.name}
        subtitle={
          during
            ? `${trip.name} · ${tripPhaseLabel(phase)}`
            : `${formatDateRange(trip.startDate, trip.endDate)} · ${tripPhaseLabel(phase)}`
        }
        leading={false}
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={trip.id} />
            <HeaderAction
              icon="add"
              label="Add"
              accessibilityLabel="Add to this trip"
              onPress={() => setAdding(true)}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[tripQuery, itemsQuery, attachmentsQuery]} />
        {itemsFailed ? <LoadFailed what="this trip's plans" onRetry={itemsQuery.refetch} /> : null}
        {/* Without them every Open button would silently vanish, as if nothing were attached. */}
        {queryView(attachmentsQuery) === 'failed' ? (
          <LoadFailed what="the attachments" onRetry={attachmentsQuery.refetch} />
        ) : null}

        <View style={styles.metaRow}>
          <Text style={[type.caption, styles.grow, { color: c.textMuted }]}>{meta}</Text>
          <HeaderAction
            label="Full itinerary"
            onPress={() => router.push(`/trip/${trip.id}/timeline`)}
          />
        </View>

        {plan.lead ? (
          <Lead
            entry={plan.lead.entry}
            reason={plan.lead.reason}
            now={now}
            resources={byItem.get(plan.lead.entry.item.id) ?? []}
            payment={payments.get(plan.lead.entry.item.id) ?? null}
            onOpen={() => open(plan.lead!.entry.item.id)}
          />
        ) : null}

        {/* Before the trip, getting ready comes before the rest of the plans (B5). */}
        {during ? null : tasksSection}

        <EntrySection
          label="Today, no fixed time"
          entries={plan.today}
          byItem={byItem}
          payments={payments}
          noteFor={(item) => todayNote(item, now)}
        />
        <EntrySection
          label="Maybe today"
          entries={plan.maybeToday}
          byItem={byItem}
          payments={payments}
          noteFor={(item) => todayNote(item, now)}
        />
        <EntrySection
          label="Also on now"
          entries={plan.alsoHappening}
          byItem={byItem}
          payments={payments}
          noteFor={(item) => happeningNote(item, now)}
        />
        <EntrySection
          label={plan.lead ? 'After that' : 'Coming up'}
          entries={plan.next}
          byItem={byItem}
          payments={payments}
          showDate
        />

        {during && base ? (
          <View style={styles.section}>
            <SectionLabel>Your base tonight</SectionLabel>
            <ItemRow
              item={base}
              payment={payments.get(base.id) ?? null}
              onPress={() => open(base.id)}
            />
          </View>
        ) : null}

        {during ? tasksSection : null}

        {!during && stays.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Stay & transport</SectionLabel>
            <Rows>
              {stays.map((stay) => (
                <ItemRow
                  key={stay.id}
                  item={stay}
                  payment={payments.get(stay.id) ?? null}
                  onPress={() => open(stay.id)}
                />
              ))}
            </Rows>
          </View>
        ) : null}

        <Rows>
          <ListRow
            title="Trip documents"
            subtitle="Tickets, bookings and insurance — on this phone and as links"
            leading={<Icon name="file" color={c.accentText} />}
            onPress={() => router.push(`/trip/${trip.id}/documents`)}
          />
          {trip.notes ? <ListRow title="Trip notes" subtitle={trip.notes} /> : null}
        </Rows>
      </ScrollView>

      <UndoToast
        message={undo?.message ?? null}
        onUndo={() => {
          if (undo) void setTaskCompleted(db, undo.taskId, false);
          setUndo(null);
        }}
        onDismiss={() => setUndo(null)}
      />
      <AddSheet visible={adding} onClose={() => setAdding(false)} tripId={trip.id} />
    </Screen>
  );
}

/** The one highlighted entry, with its ticket. */
function Lead({
  entry,
  reason,
  now,
  resources,
  payment,
  onOpen,
}: {
  entry: TimelineEntry<TripItem>;
  reason: LeadReason;
  now: Date;
  resources: readonly Resource[];
  payment: PaymentStatus | null;
  onOpen: () => void;
}) {
  const { item, moment } = entry;
  const role = entryRoleLabel(entry);
  const zone = entryZoneLabel(entry);
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const day = formatShortDate(dayKey(moment));
  const eyebrow =
    reason === 'happening' ? LEAD_EYEBROW.happening : `${LEAD_EYEBROW[reason]} · ${day}`;

  return (
    <LeadPanel
      eyebrow={eyebrow}
      time={entry.time ?? 'All day'}
      title={role ? `${role} · ${item.title}` : item.title}
      lines={[where, zone ? `${zone} time` : null]}
      note={leadNote(entry, reason, now)}
      tags={payment ? <PaymentTag status={payment} /> : null}
      onPress={onOpen}
      actions={resources.length > 0 ? <OpenResource resources={resources} /> : null}
    />
  );
}

/** Open tasks, with the done ones one tap away (F3). */
function TasksSection({
  label,
  tasks,
  done,
  loading,
  failed,
  onToggle,
  onOpen,
  onAdd,
}: {
  label: string;
  tasks: readonly TripItem[];
  done: readonly TripItem[];
  loading: boolean;
  failed: boolean;
  onToggle: (task: TripItem, completed: boolean) => void;
  onOpen: (taskId: string) => void;
  onAdd: () => void;
}) {
  const c = useColors();
  // Folded by default and not remembered (F3).
  const [showDone, setShowDone] = useState(false);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <SectionLabel>{label}</SectionLabel>
        <HeaderAction icon="add" label="Task" accessibilityLabel="Add a task" onPress={onAdd} />
      </View>
      {failed ? null : loading ? (
        <Text style={[type.body, { color: c.textMuted }]}>Loading…</Text>
      ) : tasks.length > 0 ? (
        <Rows>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => onToggle(task, true)}
              onPress={() => onOpen(task.id)}
            />
          ))}
        </Rows>
      ) : (
        <Text style={[type.body, { color: c.textMuted }]}>
          {done.length > 0 ? 'All done.' : 'Nothing left to do.'}
        </Text>
      )}
      {!failed && done.length > 0 ? (
        <HeaderAction
          label={showDone ? 'Hide done' : `Show done (${done.length})`}
          onPress={() => setShowDone((shown) => !shown)}
        />
      ) : null}
      {showDone ? (
        <Rows>
          {done.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() => onToggle(task, false)}
              onPress={() => onOpen(task.id)}
            />
          ))}
        </Rows>
      ) : null}
    </View>
  );
}

/** A heading and its rows; nothing at all when there are none. */
function EntrySection({
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
      <Rows>
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
      </Rows>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: 0,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  section: { gap: spacing.xs },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
