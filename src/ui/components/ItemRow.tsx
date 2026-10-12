import { StyleSheet, Text, View } from 'react-native';

import { paymentStatus, type PaymentStatus } from '../../domain/bookingCosts';
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
import { PaymentTag } from './PaymentTag';
import { StatusTag } from './StatusTag';

type Props = {
  item: TripItem;
  onPress: () => void;
  /** Journey-aware when the screen has the trip's items (F7); the item's own state otherwise. */
  payment?: PaymentStatus | null;
};

/** The design's item card: status and when on top, title, then where. */
export function ItemRow({ item, onPress, payment = paymentStatus(item) }: Props) {
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
        <View style={styles.tags}>
          <StatusTag status={item.status} />
          <PaymentTag status={payment} />
        </View>
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
          <Text style={[type.caption, { color: c.textMuted }]}>
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
  // Wraps rather than cutting the date short when the tags leave no room for it (F7).
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
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  done: { textDecorationLine: 'line-through', opacity: 0.7 },
  dimmed: { opacity: opacity.dimmed },
});
