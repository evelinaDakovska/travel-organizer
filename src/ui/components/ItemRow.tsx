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
  /**
   * In a list whose heading already says it — *Must* on Places, *Paid* on Expenses — the row
   * leaves out *Idea*, its priority and its payment pill rather than repeat them.
   */
  headingSays?: boolean;
  /**
   * Whether to display financial info (price and payment status tags).
   * Default true. Places browsing cards set this to false.
   */
  showFinancials?: boolean;
};

/**
 * An item as a row (B2): what it is, where, and when, with its price at the end. Status is only
 * named when it is not the usual one for a list — an idea, a cancellation; confirmed is implied.
 */
export function ItemRow({
  item,
  onPress,
  payment = paymentStatus(item),
  headingSays = false,
  showFinancials = true,
}: Props) {
  const c = useColors();
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const done = item.kind === 'task' && item.completedAt !== null;
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  const priority =
    item.status === 'idea' && item.priority && !headingSays ? capitalise(item.priority) : null;
  const detail = [kind, priority, when(item), done ? 'done' : null].filter(Boolean).join(' · ');
  // A cancellation always says so: no heading implies it.
  const showStatus =
    item.status === 'cancelled' || (item.status === 'idea' && !headingSays);
  const shownPayment = headingSays || !showFinancials ? null : payment;

  return (
    <ListRow
      title={item.title}
      subtitle={where}
      detail={detail}
      leading={<KindTile kind={item.kind} subkind={item.subkind} size={36} />}
      trailing={
        showFinancials && item.priceAmount !== null && item.priceCurrency ? (
          <View style={styles.price}>
            <Text style={[type.figure, { color: c.text }]}>
              {formatMoney(item.priceAmount, item.priceCurrency)}
            </Text>
            {/* An idea's price is a budget, not a booking or a payment (3C). */}
            {item.status === 'idea' ? (
              <Text style={[type.caption, { color: c.textMuted }]}>Estimate</Text>
            ) : null}
          </View>
        ) : null
      }
      footer={
        showStatus || shownPayment ? (
          <View style={styles.tags}>
            {showStatus ? <StatusTag status={item.status} /> : null}
            {shownPayment ? <PaymentTag status={shownPayment} /> : null}
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
  price: { alignItems: 'flex-end' },
});
