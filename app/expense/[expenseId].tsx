import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { expenseFormValues, expenseTitle } from '../../src/domain/spending';
import { ExpenseForm } from '../../src/features/expenses/ExpenseForm';
import { ResourceList } from '../../src/features/resources/ResourceList';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  deleteExpense,
  EXPENSE_TABLES,
  getExpense,
  updateExpense,
} from '../../src/repositories/expenses';
import { listResources, RESOURCE_TABLES } from '../../src/repositories/resources';
import { Button } from '../../src/ui/components/Button';
import { LoadFailed, QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';

export default function EditExpense() {
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
      <ScreenHeader title="Expense" />
      <ExpenseForm
        key={expense.id}
        submitLabel="Save changes"
        defaultValues={expenseFormValues(expense)}
        receipts={
          queryView(receiptsQuery) === 'failed' ? (
            <LoadFailed what="the receipts" onRetry={receiptsQuery.refetch} />
          ) : (
          <ResourceList
            owner={{ scope: 'expense', id: expense.id }}
            resources={receipts ?? []}
            title="Receipts"
            emptyText="No receipt yet. Add a photo of it, or the file."
          />
          )
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

