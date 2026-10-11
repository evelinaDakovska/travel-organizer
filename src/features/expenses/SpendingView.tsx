import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDayHeading } from '../../domain/format';
import { expensesByDay, type Expense, type SpendingTotal } from '../../domain/spending';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { radius, spacing, type, useColors } from '../../ui/tokens';
import { CategoryBreakdown } from './CategoryBreakdown';
import { ExpenseRow } from './ExpenseRow';

type Props = {
  expenses: readonly Expense[];
  totals: readonly SpendingTotal[];
  receipts: ReadonlyMap<string, number>;
};

/** Money spent during the trip: where it went, then each expense by day, newest first. */
export function SpendingView({ expenses, totals, receipts }: Props) {
  const c = useColors();
  const router = useRouter();
  const days = useMemo(() => expensesByDay(expenses), [expenses]);

  if (expenses.length === 0) {
    return (
      <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
        <Text style={[type.body, { color: c.textMuted }]}>
          Nothing spent yet. Tap + to add what you pay for during the trip — a taxi, groceries, a
          souvenir — with a photo of the receipt.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.view}>
      <CategoryBreakdown totals={totals} />

      {days.map(({ day, expenses: onDay }) => (
        <View key={day} style={styles.section}>
          <SectionLabel>{formatDayHeading(day)}</SectionLabel>
          {onDay.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              receipts={receipts.get(expense.id) ?? 0}
              onPress={() =>
                router.push({ pathname: '/expense/[expenseId]', params: { expenseId: expense.id } })
              }
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: spacing.xl },
  section: { gap: spacing.md },
  well: { borderRadius: radius.lg, padding: spacing.lg },
});
