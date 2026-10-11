import { StyleSheet, Text, View } from 'react-native';

import type { CurrencyTotal } from '../../domain/expenses';
import { formatMoney } from '../../domain/format';
import { Card } from '../../ui/components/Card';
import { Icon } from '../../ui/components/Icon';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  totals: readonly CurrencyTotal[];
  /** Given on Now, where the card leads to the full list; absent on that list itself. */
  onPress?: () => void;
};

/**
 * What the trip costs, one block per currency — nothing is converted. Booked items plus
 * cancellations that cannot be refunded (`tripExpenses`).
 */
export function ExpensesCard({ totals, onPress }: Props) {
  const c = useColors();

  return (
    <Card style={styles.card} onPress={onPress} accessibilityLabel="Expenses">

      {totals.map((line, index) => (
        <View
          key={line.currency}
          style={[styles.block, index > 0 && { borderTopColor: c.border, ...styles.divided }]}>
          <Text style={[type.title, { color: c.text }]}>
            {formatMoney(line.total, line.currency)}
          </Text>
          <Text style={[type.body, { color: c.textMuted }]}>
            {line.items} {line.items === 1 ? 'item' : 'items'}
          </Text>
          <View style={styles.split}>
            <Amount label="Paid" value={formatMoney(line.paid, line.currency)} />
            <Amount
              label="To pay"
              value={formatMoney(line.toPay, line.currency)}
              strong={line.toPay > 0}
            />
          </View>
          {line.lost > 0 ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Includes {formatMoney(line.lost, line.currency)} for cancelled bookings that were not
              refundable
            </Text>
          ) : null}
        </View>
      ))}
      {onPress ? (
        <View style={styles.more}>
          <Text style={[type.bodyStrong, { color: c.accentText }]}>See each expense</Text>
          <Icon name="forward" size={18} color={c.accentText} strokeWidth={2.5} />
        </View>
      ) : null}
    </Card>
  );
}

type AmountProps = { label: string; value: string; strong?: boolean };

function Amount({ label, value, strong = false }: AmountProps) {
  const c = useColors();
  return (
    <View style={styles.amount}>
      <Text style={[type.caption, { color: c.textMuted }]}>{label}</Text>
      <Text style={[strong ? type.bodyStrong : type.body, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.lg },
  block: { gap: spacing.xs },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
  split: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  amount: { gap: 2 },
  more: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
