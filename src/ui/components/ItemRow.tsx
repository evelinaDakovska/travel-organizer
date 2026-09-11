import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../../domain/format';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../domain/tripItem';
import { radius, spacing, type, useColors } from '../tokens';

type Props = { item: TripItem; onPress: () => void };

export function ItemRow({ item, onPress }: Props) {
  const c = useColors();
  const route = routeLabel(transportDetails(item));
  const cancelled = item.status === 'cancelled';
  const done = item.completedAt !== null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          opacity: pressed ? 0.7 : cancelled ? 0.6 : 1,
        },
      ]}>
      <View style={styles.when}>
        <Text style={[type.label, { color: item.start ? c.text : c.textFaint }]}>
          {timeLabel(item)}
        </Text>
      </View>

      <View style={styles.body}>
        <Text
          style={[type.heading, styles.title, { color: c.text }, cancelled && styles.struck]}
          numberOfLines={1}>
          {item.title}
        </Text>
        {route || item.locationName ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
            {route ?? item.locationName}
          </Text>
        ) : null}
        <Text style={[type.caption, { color: c.textFaint }]}>{descriptor(item)}</Text>
      </View>

      {item.priceAmount !== null && item.priceCurrency ? (
        <Text style={[type.caption, { color: item.isPaid ? c.textFaint : c.warning }]}>
          {formatMoney(item.priceAmount, item.priceCurrency)}
        </Text>
      ) : done ? (
        <Text style={[type.caption, { color: c.accent }]}>Done</Text>
      ) : null}
    </Pressable>
  );
}

function timeLabel(item: TripItem): string {
  if (!item.start) return '—';
  return item.start.precision === 'time' ? item.start.local.slice(11, 16) : 'All day';
}

function descriptor(item: TripItem): string {
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  if (item.status === 'idea') return item.priority ? `${kind} · ${item.priority}` : `${kind} · idea`;
  if (item.status === 'cancelled') return `${kind} · cancelled`;
  return kind;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  when: { width: 58 },
  body: { flex: 1, gap: 2 },
  title: { flexShrink: 1 },
  struck: { textDecorationLine: 'line-through' },
});
