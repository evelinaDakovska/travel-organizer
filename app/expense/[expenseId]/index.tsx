import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { expenseSplitRefusal, splitGoesText } from '../../../src/domain/costShares';
import { formatMoment, formatMoney } from '../../../src/domain/format';
import { categoryLabel, expenseTitle } from '../../../src/domain/spending';
import { ResourceList } from '../../../src/features/resources/ResourceList';
import { withSettlementReview } from '../../../src/features/settle/settlementReviewPrompt';
import { SplitSection } from '../../../src/features/split/SplitSection';
import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  deleteExpense,
  EXPENSE_TABLES,
  expenseSplitFacts,
  getExpense,
} from '../../../src/repositories/expenses';
import { PAYMENT_TABLES, unlinkExpense } from '../../../src/repositories/payments';
import { listTravellers } from '../../../src/repositories/travellers';
import { getTripItem } from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
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
  // Whether a charged amount counts (Phase 4): only while its currency is the trip's reporting one.
  const tripId = expense?.tripId ?? null;
  const { data: reportCurrency } = useLiveQuery(
    useCallback(async (database) => (tripId ? ((await getTrip(database, tripId))?.reportCurrency ?? null) : null), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  // Who paid and what it pays for (3D-1), by name and title.
  const payerId = expense?.payerId ?? null;
  const bookingId = expense?.tripItemId ?? null;
  const { data: links } = useLiveQuery(
    useCallback(
      async (database) => {
        const [travellers, booking] = await Promise.all([
          payerId ? listTravellers(database) : [],
          bookingId ? getTripItem(database, bookingId) : null,
        ]);
        return { payer: travellers.find((t) => t.id === payerId)?.name ?? null, booking };
      },
      [payerId, bookingId],
    ),
    [...PAYMENT_TABLES, 'travellers'],
    [payerId, bookingId],
  );
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
  const confirmDelete = async () => {
    // A split goes with its expense (3D-2), and is named.
    const split = splitGoesText((await expenseSplitFacts(db, expense.id)).people);
    Alert.alert(
      `Delete ${expenseTitle(expense)}?`,
      [
        // Receipts that could not be read are not none: say they go, without a count.
        receipts === undefined
          ? 'Any receipts go too.'
          : receiptCount > 0
            ? `Its ${receiptCount === 1 ? 'receipt goes' : `${receiptCount} receipts go`} too.`
            : null,
        split,
        'This cannot be undone.',
      ]
        .filter(Boolean)
        .join(' '),
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // A shared cost leaving a currency with settlements is said first (§15); Cancel keeps it.
            if (await withSettlementReview((options) => deleteExpense(db, expense.id, options))) router.back();
          },
        },
      ],
    );
  };

  // Explicit, never automatic (L-2): it becomes spending of its own again.
  const confirmUnlink = () =>
    Alert.alert(
      'Unlink from the booking?',
      `It will count as spending of its own${links?.booking ? `, and “${links.booking.title}” will no longer show it as paid` : ''}.`,
      [
        { text: 'Keep linked', style: 'cancel' },
        {
          text: 'Unlink',
          onPress: () => void withSettlementReview((options) => unlinkExpense(db, expense.id, options)),
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
          {expense.charged ? (
            <Fact
              label={`Charged in ${expense.charged.currency}`}
              value={
                formatMoney(expense.charged.amount, expense.charged.currency) +
                // Kept as recorded, never converted or relabelled (review P3).
                (reportCurrency === undefined || reportCurrency === expense.charged.currency
                  ? ''
                  : reportCurrency === null
                    ? ' · counts when the trip reports in ' + expense.charged.currency
                    : ` · not counted while the trip reports in ${reportCurrency}`)
              }
            />
          ) : null}
          {expense.payerId ? <Fact label="Paid by" value={links?.payer ?? '…'} /> : null}
          {expense.tripItemId ? (
            <Pressable
              onPress={() => router.push(`/item/${expense.tripItemId}`)}
              accessibilityRole="link">
              <Fact
                label="Pays for"
                value={links?.booking?.title ?? '…'}
                detail="Counted as paid on this booking, not as spending of its own"
              />
            </Pressable>
          ) : null}
          {expense.notes ? <Fact label="Description" value={expense.notes} /> : null}
        </View>

        {/* A linked expense is split with its booking, never on its own (3D-2). */}
        {expense.tripItemId === null ? (
          <SplitSection
            owner={{ expenseId: expense.id }}
            tripId={expense.tripId}
            cost={{ total: expense.amount, currency: expense.currency }}
            refusal={expenseSplitRefusal(expense)}
          />
        ) : null}

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

        {expense.tripItemId ? (
          <Button label="Unlink from booking" variant="secondary" onPress={confirmUnlink} />
        ) : null}
        <Button label="Delete expense" variant="danger" onPress={() => void confirmDelete()} />
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
