import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../../domain/format';
import type { TripTotal } from '../../domain/spending';
import { Card } from '../../ui/components/Card';
import { spacing, type, useColors } from '../../ui/tokens';

/** What the whole trip costs, one block per currency, split into bookings and spending. */
export function TripTotalCard({ totals }: { totals: readonly TripTotal[] }) {
  const c = useColors();

  return (
    <Card style={styles.card}>
      {totals.map((line, index) => (
        <View
          key={line.currency}
          style={[styles.block, index > 0 && { borderTopColor: c.border, ...styles.divided }]}>
          <Text style={[type.title, { color: c.text }]}>
            {formatMoney(line.total, line.currency)}
          </Text>
          <View style={styles.split}>
            <Part label="Bookings" value={formatMoney(line.bookings, line.currency)} />
            <Part label="Spending" value={formatMoney(line.spending, line.currency)} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function Part({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.part}>
      <Text style={[type.caption, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.body, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.lg },
  block: { gap: spacing.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
  split: { flexDirection: 'row', gap: spacing.xl },
  part: { gap: 2 },
});
