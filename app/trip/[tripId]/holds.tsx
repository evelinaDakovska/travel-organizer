import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { formatMoney } from '../../../src/domain/format';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listHolds, SHARE_TABLES, type Hold } from '../../../src/repositories/costShares';
import { listTravellers } from '../../../src/repositories/travellers';
import { ListRow, Rows } from '../../../src/ui/components/ListRow';
import { QueryScreen } from '../../../src/ui/components/QueryStates';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { gutter, spacing, type, useColors } from '../../../src/ui/tokens';

const ACTION: Record<Hold['kind'], string> = {
  paid: 'Paid by them · open to change who paid',
  share: 'In the split · open to take them out of it',
  covers: 'Covers a child’s share here · open to change who covers',
  settled: 'A settlement · open to change or delete it',
};

/**
 * What keeps someone on a trip (3D-2, `docs/phase3d2-plan.md` §7): each money record that names
 * them, opened one by one. Nothing is moved or deleted for them, and there is no *move everything
 * to someone else*: once nothing is listed, they can be removed from the trip as before.
 */
export default function MoneyHolds() {
  const c = useColors();
  const router = useRouter();
  const { tripId, travellerId } = useLocalSearchParams<{ tripId: string; travellerId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const [holds, travellers] = await Promise.all([
          listHolds(database, tripId, travellerId),
          listTravellers(database),
        ]);
        return { holds, name: travellers.find((t) => t.id === travellerId)?.name ?? 'This traveller' };
      },
      [tripId, travellerId],
    ),
    [...SHARE_TABLES, 'booking_payments', 'settlements', 'travellers'],
    [tripId, travellerId],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen title="Money records" view={view} missingText="" what="the records" onRetry={query.refetch} />
    );
  }

  const open = (hold: Hold) => {
    if (hold.settlementId) router.push({ pathname: '/trip/[tripId]/expenses', params: { tripId } });
    else if (hold.paymentId) router.push(`/payment/${hold.paymentId}`);
    else if (hold.kind === 'paid' && hold.expenseId) router.push(`/expense/${hold.expenseId}`);
    else if (hold.itemId) router.push({ pathname: '/split/edit', params: { itemId: hold.itemId } });
    else if (hold.expenseId) router.push({ pathname: '/split/edit', params: { expenseId: hold.expenseId } });
  };

  return (
    <Screen>
      <ScreenHeader title="Money records" subtitle={data.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[type.body, { color: c.text }]}>
          {data.holds.length > 0
            ? `${data.name} stays on this trip while these name them. Nothing is moved or deleted for you — open each one and change it.`
            : `Nothing names ${data.name} any more. They can be removed from the trip.`}
        </Text>
        {data.holds.length > 0 ? (
          <Rows>
            {data.holds.map((hold, i) => (
              <ListRow
                key={`${hold.kind}-${i}`}
                title={hold.title}
                subtitle={ACTION[hold.kind]}
                detail={hold.amount !== null && hold.currency ? formatMoney(hold.amount, hold.currency) : null}
                onPress={() => open(hold)}
              />
            ))}
          </Rows>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
