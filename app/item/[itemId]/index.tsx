import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { paymentStatuses, refundableOf } from '../../../src/domain/bookingCosts';
import { deleteRefusal, hasRecords } from '../../../src/domain/bookingPayments';
import { formatMoment, formatMoney } from '../../../src/domain/format';
import { journeyLegs } from '../../../src/domain/journey';
import { mapsUrl } from '../../../src/domain/places';
import { pricingOf, pricingText } from '../../../src/domain/pricing';
import { reminderLabel } from '../../../src/domain/reminders';
import { statusActions } from '../../../src/domain/status';
import { withZone } from '../../../src/domain/timezones';
import { dayKey } from '../../../src/domain/time';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../../src/domain/tripItem';
import { namesLine } from '../../../src/domain/traveller';
import { zoneMismatches } from '../../../src/domain/zoneHints';
import {
  findStayForDay,
  findTripSavedPlaces,
  findTripStays,
  resolveItemDirectionsDay,
  resolveItemEndpoint,
  type DirectionEndpoint,
} from '../../../src/domain/directions';
import { DirectionsSheet } from '../../../src/features/directions/DirectionsSheet';
import { JourneyEnds } from '../../../src/features/items/JourneyEnds';
import { PaymentsSection } from '../../../src/features/payments/PaymentsSection';
import { alertRefusal } from '../../../src/features/payments/refusal';
import { ZoneNotice } from '../../../src/features/items/ZoneNotice';
import { OpenResource } from '../../../src/features/resources/OpenResource';
import { ResourceList } from '../../../src/features/resources/ResourceList';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  countItemOwnFiles,
  listResources,
  RESOURCE_TABLES,
} from '../../../src/repositories/resources';
import {
  deleteTripItem,
  getTripItem,
  listTripItems,
  setTaskCompleted,
  setTripItemStatus,
  TRIP_ITEM_TABLES,
} from '../../../src/repositories/tripItems';
import { countMoneyRecords } from '../../../src/repositories/payments';
import { listItemParticipants, TRAVELLER_TABLES } from '../../../src/repositories/travellers';
import { Button } from '../../../src/ui/components/Button';
import { CopyValue } from '../../../src/ui/components/CopyValue';
import { Fact } from '../../../src/ui/components/Fact';
import { HeaderAction } from '../../../src/ui/components/HeaderAction';
import { ItemRow } from '../../../src/ui/components/ItemRow';
import { KindTile } from '../../../src/ui/components/KindTile';
import { Rows } from '../../../src/ui/components/ListRow';
import { PaymentTag } from '../../../src/ui/components/PaymentTag';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { Sheet } from '../../../src/ui/components/Sheet';
import { StatusTag } from '../../../src/ui/components/StatusTag';
import { Tag } from '../../../src/ui/components/Tag';
import { gutter, spacing, type, useColors } from '../../../src/ui/tokens';

export default function ItemDetail() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const [moreOpen, setMoreOpen] = useState(false);

  const itemQuery = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
    [itemId],
  );

  const { data: participants } = useLiveQuery(
    useCallback((database) => listItemParticipants(database, itemId), [itemId]),
    TRAVELLER_TABLES,
    [itemId],
  );

  const resourcesQuery = useLiveQuery(
    useCallback((database) => listResources(database, { scope: 'item', id: itemId }), [itemId]),
    RESOURCE_TABLES,
    [itemId],
  );

  const item = itemQuery.data;
  const resources = resourcesQuery.data;

  // The other legs of a journey entered together (U7); empty for everything else.
  const tripId = item?.tripId;
  const { data: tripItems } = useLiveQuery(
    useCallback(
      async (database) => (tripId ? listTripItems(database, tripId) : []),
      [tripId],
    ),
    TRIP_ITEM_TABLES,
    [tripId],
  );
  const legs = useMemo(
    () => (item && tripItems ? journeyLegs(tripItems, item) : []),
    [item, tripItems],
  );
  // Paid or not (F7), the journey's legs sharing the state of the one that holds the price.
  const payments = useMemo(() => paymentStatuses(item ? [item, ...legs] : []), [item, legs]);

  const [directionsTarget, setDirectionsTarget] = useState<{
    endpoint: DirectionEndpoint;
    targetDay: string | null;
    requestKey: string;
  } | null>(null);
  const departureEndpoint = useMemo(
    () => (item?.kind === 'transport' ? resolveItemEndpoint(item, 'destination', 'start') : null),
    [item],
  );
  const arrivalEndpoint = useMemo(
    () => (item?.kind === 'transport' ? resolveItemEndpoint(item, 'destination', 'end') : null),
    [item],
  );
  const defaultEndpoint = useMemo(
    () => (item && item.kind !== 'transport' ? resolveItemEndpoint(item, 'destination') : null),
    [item],
  );
  const stays = useMemo(() => findTripStays(tripItems ?? []), [tripItems]);
  const activeHotel = useMemo(
    () => findStayForDay(stays, directionsTarget?.targetDay),
    [stays, directionsTarget?.targetDay],
  );
  const savedPlaces = useMemo(() => findTripSavedPlaces(tripItems ?? []), [tripItems]);

  const itemView = queryView(itemQuery);
  if (itemView !== 'ready' || !item) {
    return (
      <QueryScreen
        title="Details"
        view={itemView}
        missingText="This item no longer exists."
        what="this item"
        onRetry={itemQuery.refetch}
      />
    );
  }

  const details = transportDetails(item);
  const route = routeLabel(details);
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  const actions = statusActions(item.status);
  const reminder = reminderLabel(item);
  const mismatches = zoneMismatches(item, details);
  // The place or address only; a journey's from and to are not searched.
  const maps = mapsUrl(item);
  const journey = item.kind === 'transport';
  const pricing = pricingOf(item.details);

  // Anything but a journey: one line, each end with its zone when it states its own.
  const when = item.start
    ? withZone(formatMoment(item.start.local, item.start.precision), item.startTzOverride)
    : null;
  const until = item.end
    ? `Until ${withZone(formatMoment(item.end.local, item.end.precision), item.endTzOverride)}`
    : null;

  const remove = async () => {
    setMoreOpen(false);
    // Money history is never deleted with a booking (L-1): explained, with the way out offered.
    const records = await countMoneyRecords(db, item.id);
    if (hasRecords(records)) {
      Alert.alert('This booking cannot be deleted', deleteRefusal(item.title, records)!, [
        { text: 'Close', style: 'cancel' },
        ...(item.status === 'confirmed'
          ? [
              {
                text: 'Cancel booking',
                onPress: () => confirmCancel(item, () => void setTripItemStatus(db, item.id, 'cancelled')),
              },
            ]
          : []),
      ]);
      return;
    }
    // Files also attached elsewhere stay, so they are not counted as lost.
    confirmDelete(item, await countItemOwnFiles(db, item.id), async () => {
      try {
        await deleteTripItem(db, item.id);
      } catch (error) {
        if (alertRefusal(error, 'Not deleted')) return;
        throw error;
      }
      router.back();
    });
  };

  const removeTask = async () => {
    setMoreOpen(false);
    const files = await countItemOwnFiles(db, item.id);
    Alert.alert(
      `Remove “${item.title}”?`,
      files > 0
        ? `This task will be removed from this trip. This also deletes ${files} file${files === 1 ? '' : 's'} saved on this phone that are not attached anywhere else. It cannot be undone.`
        : 'This task will be removed from this trip. It cannot be undone.',
      [
        { text: 'Keep task', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteTripItem(db, item.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title={kind}
        action={
          <View style={styles.headerActions}>
            <HeaderAction label="Edit" onPress={() => router.push(`/item/${item.id}/edit`)} />
            <HeaderAction
              icon="more"
              label="More"
              accessibilityLabel="More options"
              onPress={() => setMoreOpen(true)}
            />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[itemQuery, resourcesQuery]} />

        <View style={styles.heading}>
          <View style={styles.titleRow}>
            <KindTile kind={item.kind} subkind={item.subkind} size={40} />
            <Text style={[type.title, styles.grow, { color: c.text }]}>{item.title}</Text>
          </View>
          {route && !journey ? (
            <Text style={[type.body, { color: c.textMuted }]}>{route}</Text>
          ) : null}
          <View style={styles.tags}>
            {/* Confirmed is the usual state and goes unsaid (B4). */}
            {item.status !== 'confirmed' ? <StatusTag status={item.status} /> : null}
            <PaymentTag status={payments.get(item.id)} />
            {item.status === 'idea' && item.priority ? (
              <Tag label={capitalise(item.priority)} tone="neutral" />
            ) : null}
          </View>
        </View>

        {journey ? (
          <JourneyEnds item={item} />
        ) : when ? (
          <Fact label="When" value={when} detail={until} />
        ) : null}
        {mismatches.length > 0 ? <ZoneNotice item={item} mismatches={mismatches} /> : null}

        {/* The ticket comes before everything else that can be read later (B4). */}
        <OpenResource resources={resources ?? []} />

        {item.confirmationCode ? (
          <CopyValue label="Booking reference" value={item.confirmationCode} />
        ) : null}

        <View style={styles.facts}>
          {item.locationName || item.address ? (
            <Fact
              label="Where"
              value={item.locationName ?? item.address ?? ''}
              detail={item.locationName ? item.address : null}
              selectable
            />
          ) : null}
          {details?.number ? <Fact label="Number" value={details.number} selectable /> : null}
          {details?.seat ? <Fact label="Seat" value={details.seat} /> : null}
          {item.priceAmount !== null && item.priceCurrency ? (
            <Fact
              label={item.status === 'idea' ? 'Estimated price' : 'Price'}
              value={formatMoney(item.priceAmount, item.priceCurrency)}
              detail={[
                // The working of a per-person price (C3): 2 × EUR 90.00 Adult + …
                pricing ? pricingText(pricing, item.priceCurrency) : null,
                // An idea's price is a budget, never a payment state (3C).
                // A booking's paid state is in Payments below (3D-1); a to-do keeps its line.
                item.status === 'idea'
                  ? 'Estimate'
                  : item.kind !== 'task'
                    ? null
                    : item.isPaid
                      ? 'Paid'
                      : item.priceAmount > 0
                        ? 'Not paid yet'
                        : null,
                REFUNDABLE_LABEL[String(refundableOf(item.details))],
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : null}
          {reminder ? <Fact label="Reminder" value={reminder} muted={reminder === 'Off'} /> : null}
          {participants && participants.length > 0 ? (
            <Fact label="Who's going" value={namesLine(participants)} />
          ) : null}
          {item.notes ? <Fact label="Notes" value={item.notes} selectable /> : null}
        </View>

        {item.kind !== 'task' ? <PaymentsSection item={item} /> : null}

        {defaultEndpoint || departureEndpoint || arrivalEndpoint || maps ? (
          <View style={styles.locationActions}>
            {defaultEndpoint ? (
              <Button
                label="How to get there"
                variant="secondary"
                onPress={() =>
                  setDirectionsTarget({
                    endpoint: defaultEndpoint,
                    targetDay: resolveItemDirectionsDay(item),
                    requestKey: `${item.id}:default`,
                  })
                }
              />
            ) : null}
            {departureEndpoint ? (
              <Button
                label={
                  arrivalEndpoint
                    ? `To departure: ${departureEndpoint.title}`
                    : 'How to get to departure'
                }
                variant="secondary"
                onPress={() =>
                  setDirectionsTarget({
                    endpoint: departureEndpoint,
                    targetDay: resolveItemDirectionsDay(item, 'start'),
                    requestKey: `${item.id}:departure`,
                  })
                }
              />
            ) : null}
            {arrivalEndpoint ? (
              <Button
                label={
                  departureEndpoint
                    ? `To arrival: ${arrivalEndpoint.title}`
                    : 'How to get to arrival'
                }
                variant="secondary"
                onPress={() =>
                  setDirectionsTarget({
                    endpoint: arrivalEndpoint,
                    targetDay: resolveItemDirectionsDay(item, 'end'),
                    requestKey: `${item.id}:arrival`,
                  })
                }
              />
            ) : null}
            {maps ? (
              <Button
                label="Open in Maps"
                variant={
                  defaultEndpoint || departureEndpoint || arrivalEndpoint ? 'ghost' : 'secondary'
                }
                onPress={() => void openMaps(maps)}
              />
            ) : null}
          </View>
        ) : null}

        {item.kind === 'task' ? (
          <Button
            label={item.completedAt ? 'Mark as not done' : 'Mark as done'}
            variant={item.completedAt ? 'secondary' : 'primary'}
            onPress={() => setTaskCompleted(db, item.id, item.completedAt === null)}
          />
        ) : null}

        {legs.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Rest of this journey</SectionLabel>
            <Rows>
              {legs.map((leg) => (
                <ItemRow
                  key={leg.id}
                  item={leg}
                  payment={payments.get(leg.id) ?? null}
                  onPress={() => router.push(`/item/${leg.id}`)}
                />
              ))}
            </Rows>
          </View>
        ) : null}

        {/* A failed read is not "nothing attached" — least of all where the ticket should be. */}
        {queryView(resourcesQuery) === 'failed' ? (
          <View style={styles.section}>
            <SectionLabel>Tickets & links</SectionLabel>
            <LoadFailed what="the tickets and links" onRetry={resourcesQuery.refetch} />
          </View>
        ) : (
          <ResourceList
            owner={{ scope: 'item', id: item.id }}
            resources={resources ?? []}
            title="Tickets & links"
          />
        )}
      </ScrollView>

      {/* Moving an item between states lives one tap away, never beside the ticket (B4). */}
      <Sheet visible={moreOpen} title={item.title} onClose={() => setMoreOpen(false)}>
        <View style={styles.sheetActions}>
          {item.kind === 'task' ? (
            <Button label="Remove task" variant="danger" onPress={() => void removeTask()} />
          ) : (
            <>
              {actions.promote ? (
                <Button
                  label="Add to itinerary"
                  onPress={() => {
                    setMoreOpen(false);
                    router.push(`/item/${item.id}/schedule`);
                  }}
                />
              ) : null}
              {actions.cancel ? (
                <Button
                  label="Mark as cancelled"
                  variant="secondary"
                  onPress={() => {
                    setMoreOpen(false);
                    confirmCancel(item, () => setTripItemStatus(db, item.id, 'cancelled'));
                  }}
                />
              ) : null}
              {actions.restore ? (
                <Button
                  label="Restore to the itinerary"
                  variant="secondary"
                  onPress={() => {
                    setMoreOpen(false);
                    void setTripItemStatus(db, item.id, 'confirmed');
                  }}
                />
              ) : null}
              {actions.delete ? (
                <Button label="Delete" variant="danger" onPress={() => void remove()} />
              ) : (
                <Text style={[type.caption, { color: c.textMuted }]}>
                  To delete it, mark it as cancelled first — its tickets may be the only copies.
                </Text>
              )}
            </>
          )}
        </View>
      </Sheet>

      {directionsTarget ? (
        <DirectionsSheet
          visible={directionsTarget !== null}
          onClose={() => setDirectionsTarget(null)}
          destination={directionsTarget.endpoint}
          hotel={activeHotel}
          savedPlaces={savedPlaces}
          requestKey={directionsTarget.requestKey}
        />
      ) : null}
    </Screen>
  );
}

/** Never throws: a phone with no maps app is told so rather than left wondering. */
async function openMaps(url: string) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.warn('Open in Maps failed', error);
    Alert.alert('Could not open Maps', 'No maps app on this phone can show this place.');
  }
}

function confirmCancel(item: TripItem, cancel: () => void) {
  Alert.alert(
    `Mark ${item.title} as cancelled?`,
    'It leaves the timeline and the overview. Search still finds it, with its tickets and documents.',
    [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Mark cancelled', style: 'destructive', onPress: cancel },
    ],
  );
}

/** Names the blast radius — these files may be the only copies. */
function confirmDelete(item: TripItem, files: number, remove: () => Promise<void>) {
  Alert.alert(
    `Delete ${item.title}?`,
    files > 0
      ? `This also removes ${files} saved file${files === 1 ? '' : 's'}. It cannot be undone.`
      : 'This cannot be undone.',
    [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ],
  );
}

const REFUNDABLE_LABEL: Record<string, string | null> = {
  true: 'Refundable',
  false: 'Not refundable',
  null: null,
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  heading: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  facts: { gap: spacing.lg },
  locationActions: { gap: spacing.xs },
  section: { gap: spacing.xs },
  sheetActions: { gap: spacing.sm },
});
