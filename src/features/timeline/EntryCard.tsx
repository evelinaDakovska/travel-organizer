import { StyleSheet, Text, View } from 'react-native';

import { formatShortMoment } from '../../domain/format';
import { entryRoleLabel, entryZoneLabel } from '../../domain/itinerary';
import type { Resource } from '../../domain/resource';
import type { TimelineEntry } from '../../domain/timeline';
import { routeLabel, transportDetails, type TripItem } from '../../domain/tripItem';
import { Card } from '../../ui/components/Card';
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
};

/** One timeline entry: a whole item, or one end of a stay or journey that spans days. */
export function EntryCard({ entry, resources, onPress, showDate = false, note }: Props) {
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
        <StatusTag status={item.status} />
        <Text style={[type.caption, styles.when, { color: c.textMuted }]} numberOfLines={1}>
          {when}
        </Text>
      </View>

      <Text style={[type.heading, { color: c.text }, done && styles.done]} numberOfLines={2}>
        {role ? `${role} · ${item.title}` : item.title}
      </Text>

      {where ? (
        <Text style={[type.body, { color: c.textMuted }]} numberOfLines={1}>
          {where}
        </Text>
      ) : null}

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
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  when: { flexShrink: 1 },
  done: { textDecorationLine: 'line-through', opacity: 0.7 },
  open: { marginTop: spacing.xs },
});
