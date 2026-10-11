import { StyleSheet, Text, View } from 'react-native';

import { formatMoney, formatShortMoment } from '../../domain/format';
import { timezoneLabel } from '../../domain/timezones';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../domain/tripItem';
import { opacity, spacing, type, useColors } from '../tokens';
import { Card } from './Card';
import { KindTile } from './KindTile';
import { StatusTag } from './StatusTag';

type Props = { item: TripItem; onPress: () => void };

/** The design's item card: status and when on top, title, then where. */
export function ItemRow({ item, onPress }: Props) {
  const c = useColors();
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const done = item.kind === 'task' && item.completedAt !== null;
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={item.title}
      style={item.status === 'cancelled' && styles.dimmed}>
      <View style={styles.top}>
        <StatusTag status={item.status} />
        <Text style={[type.caption, styles.when, { color: c.textMuted }]} numberOfLines={1}>
          {when(item)}
        </Text>
      </View>

      <View style={styles.titleRow}>
        <KindTile kind={item.kind} subkind={item.subkind} />
        <View style={styles.titleText}>
          <Text style={[type.heading, { color: c.text }, done && styles.done]} numberOfLines={2}>
            {item.title}
          </Text>
          {where ? (
            <Text style={[type.body, { color: c.textMuted }]} numberOfLines={1}>
              {where}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={[type.caption, { color: c.textMuted }]}>
          {item.status === 'idea' && item.priority ? `${kind} · ${capitalise(item.priority)}` : kind}
          {done ? ' · done' : ''}
        </Text>
        {item.priceAmount !== null && item.priceCurrency ? (
          <Text style={[type.caption, { color: item.isPaid ? c.textMuted : c.warning }]}>
            {formatMoney(item.priceAmount, item.priceCurrency)}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The date, with the zone when the item states its own. Nothing for an undated idea — on Places
 * that is almost every card, so "No date" would only be noise. A booked item without one says so.
 */
function when(item: TripItem): string {
  if (!item.start) return item.status === 'idea' ? '' : 'No date yet';
  const date = formatShortMoment(item.start.local, item.start.precision);
  return item.startTzOverride ? `${date} · ${timezoneLabel(item.startTzOverride)}` : date;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  when: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleText: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  done: { textDecorationLine: 'line-through', opacity: 0.7 },
  dimmed: { opacity: opacity.dimmed },
});
