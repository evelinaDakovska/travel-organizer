import { StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../../domain/format';
import { categoryLabel, expenseTitle, type Expense } from '../../domain/spending';
import { Card } from '../../ui/components/Card';
import { Icon } from '../../ui/components/Icon';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { expense: Expense; receipts: number; onPress: () => void };

export function ExpenseRow({ expense, receipts, onPress }: Props) {
  const c = useColors();
  const title = expenseTitle(expense);

  return (
    <Card onPress={onPress} accessibilityLabel={title} style={styles.card}>
      <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
        <Icon name={expense.category} size={20} color={c.accentText} />
      </View>

      <View style={styles.body}>
        <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {/* The category is the title when there is no label; say it only once. */}
        {expense.label ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
            {categoryLabel(expense.category)}
          </Text>
        ) : null}
      </View>

      {receipts > 0 ? (
        <Icon name="receipt" size={16} color={c.textMuted} />
      ) : null}
      <Text style={[type.bodyStrong, { color: c.text }]}>
        {formatMoney(expense.amount, expense.currency)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
});
