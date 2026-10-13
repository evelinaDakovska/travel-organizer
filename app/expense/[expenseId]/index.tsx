import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatMoment, formatMoney } from '../../../src/domain/format';
import { categoryLabel, expenseTitle } from '../../../src/domain/spending';
import { ResourceList } from '../../../src/features/resources/ResourceList';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { deleteExpense, EXPENSE_TABLES, getExpense } from '../../../src/repositories/expenses';
import { listResources, RESOURCE_TABLES } from '../../../src/repositories/resources';
import { Button } from '../../../src/ui/components/Button';
import { Fact } from '../../../src/ui/components/Fact';
import { Icon } from '../../../src/ui/components/Icon';
import { LoadFailed, QueryScreen, StaleNotice } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { gutter, radius, spacing, type, useColors } from '../../../src/ui/tokens';

/**
 * An expense, read (F5): what, how much, when, its receipts. Edit is at the top, as on an item;
 * receipts are added and opened here, and Delete is at the bottom.
 */
export default function ExpenseDetail() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();

  const expenseQuery = useLiveQuery(
    useCallback((database) => getExpense(database, expenseId), [expenseId]),
    EXPENSE_TABLES,
    [expenseId],
  );
  const receiptsQuery = useLiveQuery(
    useCallback(
      (database) => listResources(database, { scope: 'expense', id: expenseId }),
      [expenseId],
    ),
    RESOURCE_TABLES,
    [expenseId],
  );

  const expense = expenseQuery.data;
  const receipts = receiptsQuery.data;
  const expenseView = queryView(expenseQuery);
  if (expenseView !== 'ready' || !expense) {
    return (
      <QueryScreen
        title="Expense"
        view={expenseView}
        missingText="This expense no longer exists."
        what="this expense"
        onRetry={expenseQuery.refetch}
      />
    );
  }

  const receiptCount = receipts?.length ?? 0;
  const confirmDelete = () =>
    Alert.alert(
      `Delete ${expenseTitle(expense)}?`,
      // Receipts that could not be read are not none: say they go, without a count.
      receipts === undefined
        ? 'Any receipts go too. This cannot be undone.'
        : receiptCount > 0
          ? `Its ${receiptCount === 1 ? 'receipt goes' : `${receiptCount} receipts go`} too. This cannot be undone.`
          : 'This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteExpense(db, expense.id);
            router.back();
          },
        },
      ],
    );

  return (
    <Screen>
      <ScreenHeader
        title="Expense"
        action={
          <Pressable
            onPress={() =>
              router.push({ pathname: '/expense/[expenseId]/edit', params: { expenseId } })
            }
            hitSlop={12}
            accessibilityRole="button">
            <Text style={[type.bodyStrong, { color: c.accentText }]}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[expenseQuery, receiptsQuery]} />

        <View style={styles.heading}>
          <View style={styles.titleRow}>
            <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
              <Icon name={expense.category} size={22} color={c.accentText} />
            </View>
            <Text style={[type.title, styles.title, { color: c.text }]}>
              {expenseTitle(expense)}
            </Text>
          </View>
          <Text style={[type.display, { color: c.text }]}>
            {formatMoney(expense.amount, expense.currency)}
          </Text>
        </View>

        {/* Only what is filled in (F4). */}
        <View style={styles.facts}>
          {expense.label ? <Fact label="Category" value={categoryLabel(expense.category)} /> : null}
          <Fact label="Date" value={formatMoment(expense.spentOn, 'date')} />
          {expense.notes ? <Fact label="Description" value={expense.notes} /> : null}
        </View>

        {queryView(receiptsQuery) === 'failed' ? (
          <View style={styles.facts}>
            <SectionLabel>Receipts</SectionLabel>
            <LoadFailed what="the receipts" onRetry={receiptsQuery.refetch} />
          </View>
        ) : (
          <ResourceList
            owner={{ scope: 'expense', id: expense.id }}
            resources={receipts ?? []}
            title="Receipts"
          />
        )}

        <Button label="Delete expense" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  heading: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  facts: { gap: spacing.md },
});
