import { StyleSheet, Text, View } from 'react-native';

import { paymentStatus, type PaymentStatus } from '../../domain/bookingCosts';
import { formatMoney, formatShortMoment } from '../../domain/format';
import {
  kindLabel,
  routeLabel,
  subkindLabel,
  transportDetails,
  type TripItem,
} from '../../domain/tripItem';
import { routePlace, zoneName } from '../../domain/zoneHints';
import { spacing, type, useColors } from '../tokens';
import { KindTile } from './KindTile';
import { ListRow } from './ListRow';
import { PaymentTag } from './PaymentTag';
import { StatusTag } from './StatusTag';

type Props = {
  item: TripItem;
  /** Without it the row is shown, not opened: no chevron, no press. */
  onPress?: () => void;
  /** Journey-aware when the screen has the trip's items (F7); the item's own state otherwise. */
  payment?: PaymentStatus | null;
};

/**
 * An item as a row (B2): what it is, where, and when, with its price at the end. Status is only
 * named when it is not the usual one for a list — an idea, a cancellation; confirmed is implied.
 */
export function ItemRow({ item, onPress, payment = paymentStatus(item) }: Props) {
  const c = useColors();
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const done = item.kind === 'task' && item.completedAt !== null;
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  const priority = item.status === 'idea' && item.priority ? capitalise(item.priority) : null;
  const detail = [kind, priority, when(item), done ? 'done' : null].filter(Boolean).join(' · ');
  const showStatus = item.status !== 'confirmed';

  return (
    <ListRow
      title={item.title}
      subtitle={where}
      detail={detail}
      leading={<KindTile kind={item.kind} subkind={item.subkind} size={36} />}
      trailing={
        item.priceAmount !== null && item.priceCurrency ? (
          <Text style={[type.figure, { color: c.text }]}>
            {formatMoney(item.priceAmount, item.priceCurrency)}
          </Text>
        ) : null
      }
      footer={
        showStatus || payment ? (
          <View style={styles.tags}>
            {showStatus ? <StatusTag status={item.status} /> : null}
            <PaymentTag status={payment} />
          </View>
        ) : null
      }
      onPress={onPress}
      accessibilityLabel={item.title}
      dimmed={item.status === 'cancelled'}
      struck={done}
    />
  );
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The date, with the zone when the item states its own. Nothing for an undated idea — on Places
 * that is almost every row, so "No date" would only be noise. A booked item without one says so.
 */
function when(item: TripItem): string | null {
  if (!item.start) return item.status === 'idea' ? null : 'No date yet';
  const date = formatShortMoment(item.start.local, item.start.precision);
  return item.startTzOverride
    ? `${date} · ${zoneName(item.startTzOverride, routePlace(item, 'start'))}`
    : date;
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
