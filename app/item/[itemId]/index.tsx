import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { refundableOf } from '../../../src/domain/bookingCosts';
import { formatMoment, formatMoney } from '../../../src/domain/format';
import { entryRoleLabel } from '../../../src/domain/itinerary';
import { journeyLegs } from '../../../src/domain/journey';
import { mapsUrl } from '../../../src/domain/places';
import { reminderLabel } from '../../../src/domain/reminders';
import { statusActions } from '../../../src/domain/status';
import { withJourneyZone, withZone } from '../../../src/domain/timezones';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../../src/domain/tripItem';
import { zoneMismatches } from '../../../src/domain/zoneHints';
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
import { Button } from '../../../src/ui/components/Button';
import { ItemRow } from '../../../src/ui/components/ItemRow';
import { KindTile } from '../../../src/ui/components/KindTile';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { StatusTag } from '../../../src/ui/components/StatusTag';
import { Tag } from '../../../src/ui/components/Tag';
import { spacing, type, useColors } from '../../../src/ui/tokens';

export default function ItemDetail() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const itemQuery = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
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

  // Each end carries its own zone: a flight leaving Vienna and landing in Sofia says so on both.
  // A journey names both zones always — inherited or not — since its times are local to each end.
  const journey = item.kind === 'transport';
  const startText = item.start
    ? journey
      ? `${entryRoleLabel({ role: 'start', item })} ${withJourneyZone(formatMoment(item.start.local, item.start.precision), item.start)}`
      : withZone(formatMoment(item.start.local, item.start.precision), item.startTzOverride)
    : 'No date yet';
  const whenDetail = !item.end
    ? ''
    : journey
      ? `${entryRoleLabel({ role: 'end', item })} ${withJourneyZone(formatMoment(item.end.local, item.end.precision), item.end)}`
      : `until ${withZone(formatMoment(item.end.local, item.end.precision), item.endTzOverride)}`;

  return (
    <Screen>
      <ScreenHeader
        title="Details"
        action={
          <Pressable
            onPress={() => router.push(`/item/${item.id}/edit`)}
            hitSlop={12}
            accessibilityRole="button">
            <Text style={[type.bodyStrong, { color: c.accentText }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[itemQuery, resourcesQuery]} />
        <View style={styles.heading}>
          <View style={styles.tags}>
            <StatusTag status={item.status} />
            {item.status === 'idea' && item.priority ? (
              <Tag label={capitalise(item.priority)} tone="neutral" />
            ) : null}
          </View>
          <Text style={[type.display, { color: c.text }]}>{item.title}</Text>
          <View style={styles.kindRow}>
            <KindTile kind={item.kind} subkind={item.subkind} size={32} />
            <Text style={[type.body, styles.kindText, { color: c.textMuted }]}>
              {route ? `${kind} · ${route}` : kind}
            </Text>
          </View>
        </View>

        <OpenResource resources={resources ?? []} />

        <View style={styles.facts}>
          {/* Empty fields are not shown (F4): no date, no When. */}
          {item.start ? <Fact label="When" value={startText} detail={whenDetail || null} /> : null}
          {mismatches.length > 0 ? <ZoneNotice item={item} mismatches={mismatches} /> : null}
          {reminder ? <Fact label="Reminder" value={reminder} muted={reminder === 'Off'} /> : null}
          {item.locationName || item.address ? (
            <Fact
              label="Where"
              value={item.locationName ?? item.address ?? ''}
              detail={item.locationName ? item.address : null}
            />
          ) : null}
          {item.confirmationCode ? (
            <Fact label="Confirmation" value={item.confirmationCode} selectable />
          ) : null}
          {details?.number ? <Fact label="Number" value={details.number} selectable /> : null}
          {details?.seat ? <Fact label="Seat" value={details.seat} /> : null}
          {item.priceAmount !== null && item.priceCurrency ? (
            <Fact
              label="Price"
              value={formatMoney(item.priceAmount, item.priceCurrency)}
              detail={[
                item.isPaid ? 'Paid' : 'Not paid yet',
                REFUNDABLE_LABEL[String(refundableOf(item.details))],
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : null}
          {item.notes ? <Fact label="Notes" value={item.notes} /> : null}
        </View>

        {maps ? (
          <Button label="Open in Maps" variant="secondary" onPress={() => void openMaps(maps)} />
        ) : null}

        {item.kind === 'task' ? (
          <Button
            label={item.completedAt ? 'Mark as not done' : 'Mark as done'}
            variant={item.completedAt ? 'secondary' : 'primary'}
            onPress={() => setTaskCompleted(db, item.id, item.completedAt === null)}
          />
        ) : null}

        {legs.length > 0 ? (
          <View style={styles.legs}>
            <SectionLabel>Rest of this journey</SectionLabel>
            {legs.map((leg) => (
              <ItemRow key={leg.id} item={leg} onPress={() => router.push(`/item/${leg.id}`)} />
            ))}
          </View>
        ) : null}

        {/* A failed read is not "nothing attached" — least of all where the ticket should be. */}
        {queryView(resourcesQuery) === 'failed' ? (
          <View style={styles.facts}>
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

        <View style={styles.actions}>
          {actions.promote ? (
            <Button
              label="Add to itinerary"
              onPress={() => router.push(`/item/${item.id}/schedule`)}
            />
          ) : null}
          {actions.cancel ? (
            <Button
              label="Mark as cancelled"
              variant="secondary"
              onPress={() => confirmCancel(item, () => setTripItemStatus(db, item.id, 'cancelled'))}
            />
          ) : null}
          {actions.restore ? (
            <Button
              label="Restore"
              variant="secondary"
              onPress={() => setTripItemStatus(db, item.id, 'confirmed')}
            />
          ) : null}
          {actions.delete ? (
            <Button
              label="Delete"
              variant="danger"
              onPress={async () =>
                // Files also attached elsewhere stay, so they are not counted as lost.
                confirmDelete(item, await countItemOwnFiles(db, item.id), async () => {
                  await deleteTripItem(db, item.id);
                  router.back();
                })
              }
            />
          ) : (
            <Text style={[type.caption, styles.hint, { color: c.textMuted }]}>
              To delete it, mark it as cancelled first — its tickets may be the only copies.
            </Text>
          )}
        </View>
      </ScrollView>
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
    'It leaves the timeline and Now. Its tickets and documents stay with it.',
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

type FactProps = {
  label: string;
  value: string;
  detail?: string | null;
  muted?: boolean;
  /** Long-press to copy — a reference is read out at a desk or pasted into a form. */
  selectable?: boolean;
};

function Fact({ label, value, detail, muted = false, selectable = false }: FactProps) {
  const c = useColors();
  return (
    <View style={styles.fact}>
      <Text style={[type.bodyStrong, styles.factLabel, { color: c.text }]}>{label}</Text>
      <View style={styles.factValue}>
        <Text style={[type.body, { color: muted ? c.textMuted : c.text }]} selectable={selectable}>
          {value}
        </Text>
        {detail ? <Text style={[type.caption, { color: c.textMuted }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindText: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: spacing.xxxl },
  heading: { gap: spacing.sm },
  tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  facts: { gap: spacing.md },
  fact: { flexDirection: 'row', gap: spacing.lg },
  factLabel: { width: 108 },
  factValue: { flex: 1, gap: 2 },
  actions: { gap: spacing.sm },
  legs: { gap: spacing.md },
  hint: { textAlign: 'center' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
