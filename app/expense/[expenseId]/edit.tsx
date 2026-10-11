import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

import { expenseFormValues } from '../../../src/domain/spending';
import { ExpenseForm } from '../../../src/features/expenses/ExpenseForm';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { EXPENSE_TABLES, getExpense, updateExpense } from '../../../src/repositories/expenses';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';

/**
 * The expense's fields (F5). Its receipts and Delete are on the detail page, as an item's are, so
 * deleting never lands back on a page whose expense is gone.
 */
export default function EditExpense() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();

  const expenseQuery = useLiveQuery(
    useCallback((database) => getExpense(database, expenseId), [expenseId]),
    EXPENSE_TABLES,
    [expenseId],
  );

  const expense = expenseQuery.data;
  const expenseView = queryView(expenseQuery);
  if (expenseView !== 'ready' || !expense) {
    return (
      <QueryScreen
        title="Edit expense"
        view={expenseView}
        missingText="This expense no longer exists."
        what="this expense"
        onRetry={expenseQuery.refetch}
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Edit expense" />
      <ExpenseForm
        key={expense.id}
        submitLabel="Save changes"
        defaultValues={expenseFormValues(expense)}
        onSubmit={async (input) => {
          await updateExpense(db, expense.id, input);
          router.back();
        }}
      />
    </Screen>
  );
}
