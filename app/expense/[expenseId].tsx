import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { expenseFormValues, expenseTitle } from '../../src/domain/spending';
import { ExpenseForm } from '../../src/features/expenses/ExpenseForm';
import { ResourceList } from '../../src/features/resources/ResourceList';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  deleteExpense,
  EXPENSE_TABLES,
  getExpense,
  updateExpense,
} from '../../src/repositories/expenses';
import { listResources, RESOURCE_TABLES } from '../../src/repositories/resources';
import { Button } from '../../src/ui/components/Button';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function EditExpense() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();

  const { data: expense, loading } = useLiveQuery(
    useCallback((database) => getExpense(database, expenseId), [expenseId]),
    EXPENSE_TABLES,
    [expenseId],
  );
  const { data: receipts } = useLiveQuery(
    useCallback(
      (database) => listResources(database, { scope: 'expense', id: expenseId }),
      [expenseId],
    ),
    RESOURCE_TABLES,
    [expenseId],
  );

  if (loading || !expense) {
    return (
      <Screen>
        <ScreenHeader title="Expense" />
        <View style={styles.centre}>
          {loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>This expense no longer exists.</Text>
          )}
        </View>
      </Screen>
    );
  }

  const receiptCount = receipts?.length ?? 0;
  const confirmDelete = () =>
    Alert.alert(
      `Delete ${expenseTitle(expense)}?`,
      receiptCount > 0
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
      <ScreenHeader title="Expense" />
      <ExpenseForm
        key={expense.id}
        submitLabel="Save changes"
        defaultValues={expenseFormValues(expense)}
        receipts={
          <ResourceList
            owner={{ scope: 'expense', id: expense.id }}
            resources={receipts ?? []}
            title="Receipts"
            emptyText="No receipt yet. Add a photo of it, or the file."
          />
        }
        onSubmit={async (input) => {
          await updateExpense(db, expense.id, input);
          router.back();
        }}
        footer={<Button label="Delete expense" variant="danger" onPress={confirmDelete} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
