import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../../domain/format';
import { categoryLabel, type SpendingTotal } from '../../domain/spending';
import { Card } from '../../ui/components/Card';
import { Icon } from '../../ui/components/Icon';
import { radius, spacing, type, useColors } from '../../ui/tokens';

/** Where the spending went: a bar per category, scaled to the largest, per currency. */
export function CategoryBreakdown({ totals }: { totals: readonly SpendingTotal[] }) {
  const c = useColors();

  return (
    <Card style={styles.card}>
      {totals.map((line, index) => {
        const largest = line.categories[0]?.total ?? 1;
        return (
          <View
            key={line.currency}
            style={[styles.block, index > 0 && { borderTopColor: c.border, ...styles.divided }]}>
            <Text style={[type.heading, { color: c.text }]}>
              {formatMoney(line.total, line.currency)}
            </Text>
            {line.categories.map(({ category, total }) => (
              <View key={category} style={styles.category}>
                <View style={styles.labelRow}>
                  <Icon name={category} size={16} color={c.textMuted} />
                  <Text style={[type.body, styles.label, { color: c.text }]}>
                    {categoryLabel(category)}
                  </Text>
                  <Text style={[type.body, { color: c.text }]}>
                    {formatMoney(total, line.currency)}
                  </Text>
                </View>
                <View style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
                  <View
                    style={[
                      styles.bar,
                      { backgroundColor: c.accent, width: `${(total / largest) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.lg },
  block: { gap: spacing.md },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
  category: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flex: 1 },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: radius.pill },
});
