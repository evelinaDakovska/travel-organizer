import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Share, ScrollView, StyleSheet, View } from 'react-native';

import { settleUpText, tripBalances } from '../../../../src/domain/balances';
import { refundNotSaid, tripExpenses } from '../../../../src/domain/bookingCosts';
import { isStandalone, spendingTotals, tripTotals } from '../../../../src/domain/spending';
import { BookingsView } from '../../../../src/features/expenses/BookingsView';
import { SpendingView } from '../../../../src/features/expenses/SpendingView';
import { SettleUpView } from '../../../../src/features/settle/SettleUpView';
import { TripTotal } from '../../../../src/features/expenses/TripTotal';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { TripTabHeader } from '../../../../src/features/trips/TripTabHeader';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import {
  countReceipts,
  EXPENSE_TABLES,
  listExpenses,
  RECEIPT_COUNT_TABLES,
} from '../../../../src/repositories/expenses';
import { listTripShares, SHARE_TABLES } from '../../../../src/repositories/costShares';
import { BALANCE_TABLES, balanceInput, keepOutside, reviewAgain } from '../../../../src/repositories/settlements';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { LoadFailed, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { Segments } from '../../../../src/ui/components/Segments';
import { gutter, spacing, useColors } from '../../../../src/ui/tokens';

type ExpenseView = 'bookings' | 'spending' | 'settle';

const VIEW_LABELS: Record<ExpenseView, string> = {
  bookings: 'Bookings',
  spending: 'Spending',
  settle: 'Settle up',
};

/**
 * What the trip costs (B8): one expected total, then bookings or spending, one view at a time —
 * and, on a trip of two or more, who owes whom (3E). Nothing is converted: every amount stays in
 * its own currency, and settling up never changes the total.
 */
export default function ExpensesScreen() {
  const c = useColors();
  const router = useRouter();
  const db = useSQLiteContext();
  const tripId = useTripId();
  const [view, setView] = useState<ExpenseView>('bookings');

  const { data: trip } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const expensesQuery = useLiveQuery(
    useCallback((database) => listExpenses(database, tripId), [tripId]),
    EXPENSE_TABLES,
    [tripId],
  );
  const receiptsQuery = useLiveQuery(
    useCallback((database) => countReceipts(database, tripId), [tripId]),
    RECEIPT_COUNT_TABLES,
    [tripId],
  );
  // How many people each expense is split between (3D-2), for its row.
  const { data: splits } = useLiveQuery(
    useCallback(async (database) => {
      const counts = new Map<string, number>();
      for (const share of await listTripShares(database, tripId)) {
        if (share.expenseId) counts.set(share.expenseId, (counts.get(share.expenseId) ?? 0) + 1);
      }
      return counts;
    }, [tripId]),
    SHARE_TABLES,
    [tripId],
  );
  // Who owes whom (3E): worked out from the records on every change, never stored.
  const { data: balanceData } = useLiveQuery(
    useCallback(async (database) => balanceInput(database, tripId), [tripId]),
    BALANCE_TABLES,
    [tripId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  const expenses = expensesQuery.data;
  const receipts = receiptsQuery.data;
  const items = itemsQuery.data;
  // A total from one of the two would be wrong, not partial: both or nothing.
  const failed = queryView(expensesQuery) === 'failed' || queryView(itemsQuery) === 'failed';
  const retry = () => {
    expensesQuery.refetch();
    itemsQuery.refetch();
  };

  const standalone = useMemo(() => (expenses ?? []).filter(isStandalone), [expenses]);
  const spending = useMemo(() => spendingTotals(expenses ?? []), [expenses]);
  const bookings = useMemo(() => tripExpenses(items ?? []), [items]);
  const totals = useMemo(() => tripTotals(bookings, spending), [bookings, spending]);
  const notCounted = useMemo(() => refundNotSaid(items ?? []).byCurrency, [items]);
  const addExpense = () => router.push({ pathname: '/expense/new', params: { tripId } });

  const members = balanceData?.members ?? [];
  const balances = useMemo(() => (balanceData ? tripBalances(balanceData) : []), [balanceData]);
  // A trip of one has nobody to settle with (plan §8).
  const canSettle = members.length >= 2;
  const views = canSettle ? (['bookings', 'spending', 'settle'] as const) : (['bookings', 'spending'] as const);
  const shown: ExpenseView = view === 'settle' && !canSettle ? 'bookings' : view;
  // Names leave the phone only from Settle up's Share button, when the person taps it (§9).
  const share = () => {
    const nameOf = (id: string) => members.find((member) => member.id === id)?.name ?? 'Someone';
    void Share.share({ message: settleUpText(trip?.name ?? 'Trip', balances, nameOf) });
  };

  return (
    <Screen>
      <TripTabHeader
        title="Expenses"
        trip={trip}
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={tripId} />
            <HeaderAction
              icon="add"
              label="Add"
              accessibilityLabel="Add an expense"
              onPress={addExpense}
            />
          </View>
        }
      />

      {expenses && items ? (
        <ScrollView contentContainerStyle={styles.content}>
          <StaleNotice queries={[expensesQuery, receiptsQuery, itemsQuery]} />
          {totals.length > 0 || notCounted.length > 0 ? (
            <TripTotal totals={totals} notCounted={notCounted} />
          ) : null}

          <Segments
            value={shown}
            options={views}
            labelFor={(option) => VIEW_LABELS[option]}
            onChange={setView}
          />

          {shown === 'settle' ? (
            <SettleUpView
              tripId={tripId}
              balances={balances}
              members={members}
              onShare={share}
              onKeepOutside={(cost, seen) => keepOutside(db, tripId, cost, seen)}
              onReviewAgain={(cost) => reviewAgain(db, cost)}
            />
          ) : shown === 'spending' ? (
            <SpendingView
              // An expense that pays for a booking is listed on that booking (3D-1).
              expenses={standalone}
              totals={spending}
              receipts={receipts ?? new Map()}
              splits={splits}
              onAdd={addExpense}
            />
          ) : (
            <BookingsView items={items} totals={bookings} />
          )}
        </ScrollView>
      ) : (
        <View style={styles.centre}>
          {failed ? (
            <LoadFailed what="the expenses" onRetry={retry} />
          ) : (
            <ActivityIndicator color={c.accent} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
