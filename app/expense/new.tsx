import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ResourceInput } from '../../src/domain/resource';
import { nextCurrency } from '../../src/domain/spending';
import { deviceToday } from '../../src/domain/trip';
import { ExpenseForm } from '../../src/features/expenses/ExpenseForm';
import { PendingReceipts } from '../../src/features/expenses/PendingReceipts';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { createExpense, EXPENSE_TABLES, listExpenses } from '../../src/repositories/expenses';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function NewExpense() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const [receipts, setReceipts] = useState<ResourceInput[]>([]);

  // Only to start in the currency used last on this trip.
  const { data: expenses } = useLiveQuery(
    useCallback(async (database) => (tripId ? listExpenses(database, tripId) : []), [tripId]),
    EXPENSE_TABLES,
    [tripId],
  );

  if (!tripId) {
    return (
      <Screen>
        <ScreenHeader title="New expense" leading="close" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>Nothing to add this expense to.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="New expense" leading="close" />
      {expenses ? (
        <ExpenseForm
          submitLabel="Save expense"
          defaultValues={{
            currency: nextCurrency(expenses),
            spentOn: deviceToday(),
          }}
          receipts={<PendingReceipts receipts={receipts} onChange={setReceipts} />}
          onSubmit={async (input) => {
            await createExpense(db, tripId, input, receipts);
            router.back();
          }}
        />
      ) : (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
