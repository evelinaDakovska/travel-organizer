import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

import { deviceToday } from '../../src/domain/trip';
import { alertRefusal } from '../../src/features/payments/refusal';
import { SettlementForm } from '../../src/features/settle/SettlementForm';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { BALANCE_TABLES, balanceInput, createSettlement } from '../../src/repositories/settlements';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';

/**
 * Records money one traveller gave another (3E). Opened from a suggested transfer it starts filled
 * in — who, whom, how much, which currency — and every part can be changed: a smaller amount is a
 * partial settlement. Opened on its own it starts empty.
 */
export default function NewSettlement() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId: string;
    fromId?: string;
    toId?: string;
    amount?: string;
    currency?: string;
  }>();
  const { tripId } = params;

  const query = useLiveQuery(
    useCallback((database) => balanceInput(database, tripId), [tripId]),
    BALANCE_TABLES,
    [tripId],
  );

  const balances = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !balances) {
    return (
      <QueryScreen
        title="Record a settlement"
        view={view}
        missingText="This trip no longer exists."
        what="the balances"
        onRetry={query.refetch}
      />
    );
  }

  const amount = params.amount ? Number(params.amount) : undefined;
  return (
    <Screen>
      <ScreenHeader title="Record a settlement" leading="close" />
      <SettlementForm
        balances={balances}
        members={balances.members}
        submitLabel="Save settlement"
        defaultValues={{
          fromId: params.fromId ?? '',
          toId: params.toId ?? '',
          amount: Number.isInteger(amount) ? amount : undefined,
          currency: params.currency ?? balances.costs[0]?.currency ?? 'EUR',
          settledOn: deviceToday(),
        }}
        onSubmit={async (input) => {
          try {
            await createSettlement(db, tripId, input);
          } catch (error) {
            if (alertRefusal(error)) return;
            throw error;
          }
          router.back();
        }}
      />
    </Screen>
  );
}
