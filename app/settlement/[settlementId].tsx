import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { formatMoney } from '../../src/domain/format';
import { alertRefusal } from '../../src/features/payments/refusal';
import { SettlementForm } from '../../src/features/settle/SettlementForm';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  BALANCE_TABLES,
  balanceInput,
  deleteSettlement,
  getSettlement,
  updateSettlement,
} from '../../src/repositories/settlements';
import { Button } from '../../src/ui/components/Button';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';

/**
 * One settlement (3E): edited here, and deleted only from here, after a confirmation naming it.
 * Nothing else removes one but deleting the whole trip.
 */
export default function SettlementDetail() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { settlementId } = useLocalSearchParams<{ settlementId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const settlement = await getSettlement(database, settlementId);
        if (!settlement) return null;
        return { settlement, balances: await balanceInput(database, settlement.tripId) };
      },
      [settlementId],
    ),
    BALANCE_TABLES,
    [settlementId],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen
        title="Settlement"
        view={view}
        missingText="This settlement no longer exists."
        what="this settlement"
        onRetry={query.refetch}
      />
    );
  }

  const { settlement, balances } = data;
  const nameOf = (id: string) => balances.members.find((member) => member.id === id)?.name ?? 'Someone';
  const what = `${nameOf(settlement.fromId)} → ${nameOf(settlement.toId)} · ${formatMoney(settlement.amount, settlement.currency)}`;
  const confirmDelete = () =>
    Alert.alert(`Delete the settlement ${what}?`, 'The balances will be worked out without it. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSettlement(db, settlement.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <ScreenHeader title="Settlement" subtitle={what} />
      <SettlementForm
        key={settlement.id}
        balances={balances}
        members={balances.members}
        editingId={settlement.id}
        submitLabel="Save changes"
        defaultValues={{
          fromId: settlement.fromId,
          toId: settlement.toId,
          amount: settlement.amount,
          currency: settlement.currency,
          settledOn: settlement.settledOn,
          note: settlement.note ?? undefined,
        }}
        onSubmit={async (input) => {
          try {
            await updateSettlement(db, settlement.id, input);
          } catch (error) {
            if (alertRefusal(error)) return;
            throw error;
          }
          router.back();
        }}
        secondaryActions={<Button label="Delete settlement" variant="danger" onPress={confirmDelete} />}
      />
    </Screen>
  );
}
