import { StyleSheet, Text, View } from 'react-native';

import { formatMoney, formatShortMoment } from '../../domain/format';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../domain/tripItem';
import { opacity, spacing, type, useColors } from '../tokens';
import { Card } from './Card';
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
          {item.start ? formatShortMoment(item.start.local, item.start.precision) : 'No date'}
        </Text>
      </View>

      <Text style={[type.heading, { color: c.text }, done && styles.done]} numberOfLines={2}>
        {item.title}
      </Text>

      {where ? (
        <Text style={[type.body, { color: c.textMuted }]} numberOfLines={1}>
          {where}
        </Text>
      ) : null}

      <View style={styles.meta}>
        <Text style={[type.caption, { color: c.textMuted }]}>
          {item.status === 'idea' && item.priority ? `${kind} · ${item.priority}` : kind}
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

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  when: { flexShrink: 1 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  done: { textDecorationLine: 'line-through', opacity: 0.7 },
  dimmed: { opacity: opacity.dimmed },
});
