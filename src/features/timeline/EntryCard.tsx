import { StyleSheet, Text, View } from 'react-native';

import type { PaymentStatus } from '../../domain/bookingCosts';
import { formatShortMoment } from '../../domain/format';
import { entryRoleLabel, entryZoneLabel } from '../../domain/itinerary';
import type { Resource } from '../../domain/resource';
import type { TimelineEntry } from '../../domain/timeline';
import { routeLabel, transportDetails, type TripItem } from '../../domain/tripItem';
import { Card } from '../../ui/components/Card';
import { KindTile } from '../../ui/components/KindTile';
import { PaymentTag } from '../../ui/components/PaymentTag';
import { StatusTag } from '../../ui/components/StatusTag';
import { spacing, type, useColors } from '../../ui/tokens';
import { OpenResource } from '../resources/OpenResource';

type Props = {
  entry: TimelineEntry<TripItem>;
  resources: readonly Resource[];
  onPress: () => void;
  /** On Now the day is not in a heading above, so the card carries it. */
  showDate?: boolean;
  /** A line under the place, e.g. 'Until 11:15' on a Happening now card. */
  note?: string | null;
  /** Paid or not (F7); the screen works it out over all the trip's items, journeys included. */
  payment?: PaymentStatus | null;
};

/** One timeline entry: a whole item, or one end of a stay or journey that spans days. */
export function EntryCard({ entry, resources, onPress, showDate = false, note, payment }: Props) {
  const c = useColors();
  const { item, moment } = entry;

  const role = entryRoleLabel(entry);
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const zone = entryZoneLabel(entry);
  const when = [
    showDate ? formatShortMoment(moment.local, moment.precision) : (entry.time ?? 'All day'),
    zone,
  ]
    .filter(Boolean)
    .join(' · ');
  const done = item.kind === 'task' && item.completedAt !== null;

  return (
    <Card onPress={onPress} accessibilityLabel={item.title}>
      <View style={styles.top}>
        <View style={styles.tags}>
          <StatusTag status={item.status} />
          <PaymentTag status={payment} />
        </View>
        <Text style={[type.caption, styles.when, { color: c.textMuted }]} numberOfLines={1}>
          {when}
        </Text>
      </View>

      <View style={styles.titleRow}>
        <KindTile kind={item.kind} subkind={item.subkind} />
        <View style={styles.titleText}>
          <Text style={[type.heading, { color: c.text }, done && styles.done]} numberOfLines={2}>
            {role ? `${role} · ${item.title}` : item.title}
          </Text>
          {where ? (
            <Text style={[type.body, { color: c.textMuted }]} numberOfLines={1}>
              {where}
            </Text>
          ) : null}
        </View>
      </View>

      {note ? (
        <Text style={[type.bodyStrong, { color: c.accentText }]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}

      {resources.length > 0 ? (
        <View style={styles.open}>
          <OpenResource resources={resources} compact />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than cutting the time short when the tags leave no room for it (F7).
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tags: { flexDirection: 'row', gap: spacing.xs },
  when: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleText: { flex: 1, gap: 2 },
  done: { textDecorationLine: 'line-through', opacity: 0.7 },
  open: { marginTop: spacing.xs },
});
