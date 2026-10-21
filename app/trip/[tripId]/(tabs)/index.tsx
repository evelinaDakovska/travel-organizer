import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getTripMoreActions } from '../../../../src/config/features';
import { paymentStatuses, type PaymentStatus } from '../../../../src/domain/bookingCosts';
import { formatDateRange, formatMoney, formatShortDate } from '../../../../src/domain/format';
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
  pastTripSummary,
  resolveStayForOverview,
  staysAndRentals,
  type LeadReason,
} from '../../../../src/domain/overview';
import { nextCurrency } from '../../../../src/domain/spending';
import { groupResourcesByItem, type Resource } from '../../../../src/domain/resource';
import { dayKey } from '../../../../src/domain/time';
import type { TimelineEntry } from '../../../../src/domain/timeline';
import { timezoneLabel } from '../../../../src/domain/timezones';
import { progressText } from '../../../../src/domain/lists';
import { tripPeopleLine } from '../../../../src/domain/traveller';
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
import { LIST_TABLES, listTripLists } from '../../../../src/repositories/lists';
import { listTripTravellers, TRAVELLER_TABLES } from '../../../../src/repositories/travellers';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import {
  EXPENSE_TABLES,
  listExpenses,
} from '../../../../src/repositories/expenses';
import {
  findTripSavedPlaces,
  findTripStays,
  resolveItemEndpoint,
  type DirectionEndpoint,
} from '../../../../src/domain/directions';
import { DirectionsSheet } from '../../../../src/features/directions/DirectionsSheet';
import { QuickExpenseSheet } from '../../../../src/features/expenses/QuickExpenseSheet';
import { Button } from '../../../../src/ui/components/Button';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { Icon, type IconName } from '../../../../src/ui/components/Icon';
import { IconTile } from '../../../../src/ui/components/IconTile';
import { ItemRow } from '../../../../src/ui/components/ItemRow';
import { LeadPanel } from '../../../../src/ui/components/LeadPanel';
import { ListRow, Rows } from '../../../../src/ui/components/ListRow';
import { PaymentTag } from '../../../../src/ui/components/PaymentTag';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { Sheet } from '../../../../src/ui/components/Sheet';
import { UndoToast } from '../../../../src/ui/components/UndoToast';
import { gutter, radius, spacing, type, useColors } from '../../../../src/ui/tokens';


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
  const [moreOpen, setMoreOpen] = useState(false);
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
  const { data: members } = useLiveQuery(
    useCallback((database) => listTripTravellers(database, tripId), [tripId]),
    TRAVELLER_TABLES,
    [tripId],
  );
  const { data: lists } = useLiveQuery(
    useCallback((database) => listTripLists(database, tripId), [tripId]),
    LIST_TABLES,
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
  const allStays = useMemo(() => findTripStays(items ?? []), [items]);
  const savedPlaces = useMemo(() => findTripSavedPlaces(items ?? []), [items]);
  const moreActions = useMemo(() => getTripMoreActions(), []);
  const [directionsTarget, setDirectionsTarget] = useState<DirectionEndpoint | null>(null);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);

  const expensesQuery = useLiveQuery(
    useCallback((database) => listExpenses(database, tripId), [tripId]),
    EXPENSE_TABLES,
    [tripId],
  );
  const expenses = expensesQuery.data ?? [];

  const stayResolution = useMemo(
    () => resolveStayForOverview(items ?? [], today, now),
    [items, today, now],
  );
  const summary = useMemo(
    () => pastTripSummary(items ?? [], expenses),
    [items, expenses],
  );
  const spendingText = useMemo(
    () =>
      Object.entries(summary.totalSpentByCurrency)
        .map(([cur, amt]) => formatMoney(amt, cur))
        .join(', '),
    [summary],
  );

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
  const isPast = phase.phase === 'after';

  // The trip's travellers, or the names typed before there were profiles (FB-12).
  const people = tripPeopleLine(members ?? [], trip.travellers);
  const meta = [`${timezoneLabel(trip.defaultTz)} time`, people].filter(Boolean).join(' · ');

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
            : isPast
              ? `${formatDateRange(trip.startDate, trip.endDate)} · Ended`
              : `${formatDateRange(trip.startDate, trip.endDate)} · ${tripPhaseLabel(phase)}`
        }
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={trip.id} />
            <HeaderAction
              icon="add"
              label="Add"
              accessibilityLabel="Add to this trip"
              onPress={() => setAdding(true)}
            />
            <HeaderAction
              icon="more"
              accessibilityLabel="More for this trip"
              onPress={() => setMoreOpen(true)}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[tripQuery, itemsQuery, attachmentsQuery, expensesQuery]} />
        {itemsFailed ? <LoadFailed what="this trip's plans" onRetry={itemsQuery.refetch} /> : null}
        {/* Without them every Open button would silently vanish, as if nothing were attached. */}
        {queryView(attachmentsQuery) === 'failed' ? (
          <LoadFailed what="the attachments" onRetry={attachmentsQuery.refetch} />
        ) : null}

        {isPast ? (
          <>
            <View style={styles.metaRow}>
              <Text style={[type.caption, styles.grow, { color: c.textMuted }]}>{meta}</Text>
            </View>

            <LeadPanel
              eyebrow="Trip ended"
              title={trip.name}
              lines={[
                formatDateRange(trip.startDate, trip.endDate),
                `${summary.placesCount} confirmed ${summary.placesCount === 1 ? 'item' : 'items'}`,
                spendingText ? `Total spent: ${spendingText}` : 'No recorded expenses',
              ]}
              onPress={() => router.push(`/trip/${trip.id}/timeline`)}
            />

            <Rows>
              <ListRow
                title="Itinerary"
                subtitle="Full day by day timeline"
                leading={<IconTile name="timeline" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/timeline`)}
              />
              <ListRow
                title="Expenses"
                subtitle={spendingText ? `Total: ${spendingText}` : 'View recorded expenses'}
                leading={<IconTile name="receipt" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/expenses`)}
              />
              <ListRow
                title="Travellers"
                subtitle={people || 'Who went'}
                leading={<IconTile name="travellers" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/travellers`)}
              />
              <ListRow
                title="Trip documents"
                subtitle="Tickets, bookings and files"
                leading={<IconTile name="file" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/documents`)}
              />
              {trip.notes ? (
                <ListRow
                  title="Trip notes"
                  subtitle={trip.notes}
                  leading={<IconTile name="lists" size={36} />}
                />
              ) : null}
            </Rows>
          </>
        ) : during ? (
          <>
            <View style={styles.quickBar}>
              <Button
                label="+ Add expense"
                variant="secondary"
                onPress={() => setQuickExpenseOpen(true)}
              />
            </View>

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
                onDirections={setDirectionsTarget}
              />
            ) : (
              <View
                style={[
                  styles.emptyLead,
                  { backgroundColor: c.surfaceSunken, borderColor: c.border },
                ]}>
                <Text style={[type.heading, { color: c.text }]}>No scheduled events right now</Text>
                <Text style={[type.caption, { color: c.textMuted }]}>
                  Check your timeline or add a plan to today.
                </Text>
                <Button label="Add an event" variant="secondary" onPress={() => setAdding(true)} />
              </View>
            )}

            {stayResolution.type === 'current' ? (
              <View style={styles.section}>
                <SectionLabel>Your stay</SectionLabel>
                <StayCard
                  stay={stayResolution.stay}
                  eyebrow={
                    stayResolution.status === 'checkin_today'
                      ? `Check-in today${stayResolution.checkinTime ? ` · ${stayResolution.checkinTime}` : ''}`
                      : 'Stay tonight'
                  }
                  resources={byItem.get(stayResolution.stay.id) ?? []}
                  payment={payments.get(stayResolution.stay.id) ?? null}
                  onOpen={() => open(stayResolution.stay.id)}
                  onDirections={setDirectionsTarget}
                />
              </View>
            ) : stayResolution.type === 'upcoming' ? (
              <View style={styles.section}>
                <SectionLabel>Your stay</SectionLabel>
                <StayCard
                  stay={stayResolution.stay}
                  eyebrow={
                    stayResolution.status === 'checkin_today'
                      ? `Check-in today${stayResolution.checkinTime ? ` · ${stayResolution.checkinTime}` : ''}`
                      : `Next stay · Check in ${formatShortDate(stayResolution.checkinDay)}${
                          stayResolution.checkinTime ? ` · ${stayResolution.checkinTime}` : ''
                        }`
                  }
                  resources={byItem.get(stayResolution.stay.id) ?? []}
                  payment={payments.get(stayResolution.stay.id) ?? null}
                  onOpen={() => open(stayResolution.stay.id)}
                  onDirections={setDirectionsTarget}
                />
              </View>
            ) : stayResolution.type === 'overnight_transport' ? (
              <View style={styles.section}>
                <SectionLabel>Your stay</SectionLabel>
                <StayCard
                  stay={stayResolution.transport}
                  eyebrow="Tonight · Overnight transport"
                  resources={byItem.get(stayResolution.transport.id) ?? []}
                  payment={payments.get(stayResolution.transport.id) ?? null}
                  onOpen={() => open(stayResolution.transport.id)}
                  onDirections={setDirectionsTarget}
                />
              </View>
            ) : null}

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
            {!plan.lead && plan.next.length > 0 ? (
              <EntrySection
                label="Coming up"
                entries={plan.next}
                byItem={byItem}
                payments={payments}
                showDate
              />
            ) : null}

            {tasksSection}

            {lists && lists.length > 0 ? (
              <View style={styles.section}>
                <SectionLabel>Lists</SectionLabel>
                <Rows>
                  {lists.map((list) => (
                    <ListRow
                      key={list.id}
                      title={list.name}
                      subtitle={progressText(list.kind, list)}
                      leading={
                        <IconTile
                          name={list.kind === 'packing' ? 'packing' : 'shoppingList'}
                          size={36}
                        />
                      }
                      onPress={() =>
                        router.push({ pathname: '/list/[listId]', params: { listId: list.id } })
                      }
                    />
                  ))}
                </Rows>
              </View>
            ) : null}

            <Rows>
              <ListRow
                title="Travellers"
                subtitle={people || 'Who is going'}
                leading={<IconTile name="travellers" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/travellers`)}
              />
              <ListRow
                title="Trip documents"
                subtitle="Tickets, bookings and insurance — on this phone and as links"
                leading={<IconTile name="file" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/documents`)}
              />
              {trip.notes ? (
                <ListRow
                  title="Trip notes"
                  subtitle={trip.notes}
                  leading={<IconTile name="lists" size={36} />}
                />
              ) : null}
            </Rows>
          </>
        ) : (
          <>
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
                onDirections={setDirectionsTarget}
              />
            ) : null}

            {tasksSection}

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
            {!plan.lead && plan.next.length > 0 ? (
              <EntrySection
                label="Coming up"
                entries={plan.next}
                byItem={byItem}
                payments={payments}
                showDate
              />
            ) : null}

            {stays.length > 0 ? (
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

            {lists && lists.length > 0 ? (
              <View style={styles.section}>
                <SectionLabel>Lists</SectionLabel>
                <Rows>
                  {lists.map((list) => (
                    <ListRow
                      key={list.id}
                      title={list.name}
                      subtitle={progressText(list.kind, list)}
                      leading={
                        <IconTile
                          name={list.kind === 'packing' ? 'packing' : 'shoppingList'}
                          size={36}
                        />
                      }
                      onPress={() =>
                        router.push({ pathname: '/list/[listId]', params: { listId: list.id } })
                      }
                    />
                  ))}
                </Rows>
              </View>
            ) : null}

            <Rows>
              <ListRow
                title="Travellers"
                subtitle={people || 'Who is going'}
                leading={<IconTile name="travellers" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/travellers`)}
              />
              <ListRow
                title="Trip documents"
                subtitle="Tickets, bookings and insurance — on this phone and as links"
                leading={<IconTile name="file" size={36} />}
                onPress={() => router.push(`/trip/${trip.id}/documents`)}
              />
              {trip.notes ? (
                <ListRow
                  title="Trip notes"
                  subtitle={trip.notes}
                  leading={<IconTile name="lists" size={36} />}
                />
              ) : null}
            </Rows>
          </>
        )}
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
      <Sheet visible={moreOpen} title={trip.name} onClose={() => setMoreOpen(false)}>
        <Rows>
          {moreActions.map(({ title, subtitle, icon, path }) => (
            <ListRow
              key={path}
              title={title}
              subtitle={subtitle}
              leading={<Icon name={icon} color={c.accentText} />}
              onPress={() => {
                setMoreOpen(false);
                if (path === 'feedback') {
                  router.push('/feedback');
                } else {
                  router.push(`/trip/${trip.id}/${path}`);
                }
              }}
            />
          ))}
        </Rows>
      </Sheet>

      {directionsTarget ? (
        <DirectionsSheet
          visible={directionsTarget !== null}
          onClose={() => setDirectionsTarget(null)}
          destination={directionsTarget}
          hotel={base}
          savedPlaces={savedPlaces}
        />
      ) : null}

      <QuickExpenseSheet
        visible={quickExpenseOpen}
        onClose={() => setQuickExpenseOpen(false)}
        tripId={trip.id}
        defaultCurrency={nextCurrency(expenses)}
        bookings={items ?? []}
      />
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
  onDirections,
}: {
  entry: TimelineEntry<TripItem>;
  reason: LeadReason;
  now: Date;
  resources: readonly Resource[];
  payment: PaymentStatus | null;
  onOpen: () => void;
  onDirections?: (endpoint: DirectionEndpoint) => void;
}) {
  const { item, moment } = entry;
  const role = entryRoleLabel(entry);
  const zone = entryZoneLabel(entry);
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const day = formatShortDate(dayKey(moment));
  const eyebrow =
    reason === 'happening' ? LEAD_EYEBROW.happening : `${LEAD_EYEBROW[reason]} · ${day}`;

  const destinationEndpoint = resolveItemEndpoint(item, 'destination', entry.role);

  return (
    <LeadPanel
      eyebrow={eyebrow}
      time={entry.time ?? 'All day'}
      title={role ? `${role} · ${item.title}` : item.title}
      lines={[where, zone ? `${zone} time` : null]}
      note={leadNote(entry, reason, now)}
      tags={payment ? <PaymentTag status={payment} /> : null}
      onPress={onOpen}
      actions={
        resources.length > 0 || (destinationEndpoint && onDirections) ? (
          <View style={styles.leadActions}>
            {resources.length > 0 ? <OpenResource resources={resources} /> : null}
            {destinationEndpoint && onDirections ? (
              <Button
                label="Directions"
                variant={resources.length > 0 ? 'secondary' : 'primary'}
                onPress={() => onDirections(destinationEndpoint)}
              />
            ) : null}
          </View>
        ) : null
      }
    />
  );
}

/** Accommodation card for the current night or next stay. */
function StayCard({
  stay,
  eyebrow,
  resources,
  payment,
  onOpen,
  onDirections,
}: {
  stay: TripItem;
  eyebrow: string;
  resources: readonly Resource[];
  payment: PaymentStatus | null;
  onOpen: () => void;
  onDirections?: (endpoint: DirectionEndpoint) => void;
}) {
  const where = routeLabel(transportDetails(stay)) ?? stay.address ?? stay.locationName;
  const destinationEndpoint = resolveItemEndpoint(stay, 'destination');

  return (
    <LeadPanel
      eyebrow={eyebrow}
      title={stay.title}
      lines={[where].filter(Boolean)}
      tags={payment ? <PaymentTag status={payment} /> : null}
      onPress={onOpen}
      actions={
        resources.length > 0 || (destinationEndpoint && onDirections) ? (
          <View style={styles.leadActions}>
            {resources.length > 0 ? <OpenResource resources={resources} /> : null}
            {destinationEndpoint && onDirections ? (
              <Button
                label="Directions"
                variant={resources.length > 0 ? 'secondary' : 'primary'}
                onPress={() => onDirections(destinationEndpoint)}
              />
            ) : null}
          </View>
        ) : null
      }
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
  leadActions: { gap: spacing.sm },
  quickBar: {
    paddingTop: spacing.xs,
  },
  emptyLead: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
});
