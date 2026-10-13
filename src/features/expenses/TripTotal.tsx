import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../../domain/format';
import type { TripTotal as Total } from '../../domain/spending';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  totals: readonly Total[];
  /** Cancelled bookings whose refund nobody set: named beside the total they are left out of. */
  notCounted: readonly { currency: string; amount: number }[];
};

/**
 * The one expected total for the trip (B8): bookings plus spending, per currency, never converted.
 * Shown once, above the switch, so Bookings and Spending never change what it means.
 */
export function TripTotal({ totals, notCounted }: Props) {
  const c = useColors();

  return (
    <View style={styles.block} accessibilityRole="summary">
      <Text style={[type.overline, { color: c.textMuted }]}>EXPECTED TRIP COST</Text>
      {totals.map((line) => (
        <View key={line.currency} style={styles.line}>
          <Text style={[type.display, { color: c.text }]}>
            {formatMoney(line.total, line.currency)}
          </Text>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Bookings {formatMoney(line.bookings, line.currency)} · Spending{' '}
            {formatMoney(line.spending, line.currency)}
          </Text>
        </View>
      ))}
      {/* Not counted, but never silently zero (R10): an unknown is not a refund. */}
      {notCounted.length > 0 ? (
        <Text style={[type.caption, { color: c.attention }]}>
          Not counted:{' '}
          {notCounted.map(({ currency, amount }) => formatMoney(amount, currency)).join(' · ')}{' '}
          cancelled with the refund not specified.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  line: { gap: 2 },
});
