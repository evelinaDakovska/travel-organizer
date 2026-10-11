import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { tripExpenses } from '../../../../src/domain/bookingCosts';
import { spendingTotals, tripTotals } from '../../../../src/domain/spending';
import { BookingsView } from '../../../../src/features/expenses/BookingsView';
import { SpendingView } from '../../../../src/features/expenses/SpendingView';
import { TripTotalCard } from '../../../../src/features/expenses/TripTotalCard';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import {
  countReceipts,
  EXPENSE_TABLES,
  listExpenses,
  RECEIPT_COUNT_TABLES,
} from '../../../../src/repositories/expenses';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { ChoiceField } from '../../../../src/ui/components/ChoiceField';
import { LoadFailed, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { spacing, useColors } from '../../../../src/ui/tokens';

type ExpenseView = 'spending' | 'bookings';

const VIEW_LABELS: Record<ExpenseView, string> = { spending: 'Spending', bookings: 'Bookings' };

/** What the trip costs: everything in one total, then spending and bookings one view at a time. */
export default function ExpensesScreen() {
  const c = useColors();
  const tripId = useTripId();
  const [view, setView] = useState<ExpenseView>('spending');

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

  const spending = useMemo(() => spendingTotals(expenses ?? []), [expenses]);
  const bookings = useMemo(() => tripExpenses(items ?? []), [items]);
  const totals = useMemo(() => tripTotals(bookings, spending), [bookings, spending]);

  return (
    <Screen>
      <ScreenHeader
        title="Expenses"
        subtitle={trip?.name}
        action={<SearchButton tripId={tripId} />}
      />

      {expenses && items ? (
        <ScrollView contentContainerStyle={styles.content}>
          <StaleNotice queries={[expensesQuery, receiptsQuery, itemsQuery]} />
          {totals.length > 0 ? <TripTotalCard totals={totals} /> : null}

          <ChoiceField
            value={view}
            options={['spending', 'bookings'] as const}
            labelFor={(option) => VIEW_LABELS[option]}
            onChange={(next) => next && setView(next)}
          />

          {view === 'spending' ? (
            <SpendingView expenses={expenses} totals={spending} receipts={receipts ?? new Map()} />
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
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: 120 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
