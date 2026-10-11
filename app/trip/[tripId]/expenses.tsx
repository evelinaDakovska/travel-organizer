import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { expenseGroups, tripExpenses } from '../../../src/domain/expenses';
import { ExpensesCard } from '../../../src/features/trips/ExpensesCard';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { listTripItems, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { ItemRow } from '../../../src/ui/components/ItemRow';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../src/ui/tokens';

/** The Expenses card from Now, with every item behind it — what is still owed first. */
export default function TripExpenses() {
  const c = useColors();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const { data: items } = useLiveQuery(
    useCallback((database) => listTripItems(database, tripId), [tripId]),
    TRIP_ITEM_TABLES,
    [tripId],
  );

  const totals = useMemo(() => tripExpenses(items ?? []), [items]);
  const { toPay, paid } = useMemo(() => expenseGroups(items ?? []), [items]);

  return (
    <Screen>
      <ScreenHeader title="Expenses" />

      <ScrollView contentContainerStyle={styles.content}>
        {items && totals.length === 0 ? (
          <Text style={[type.body, { color: c.textMuted }]}>
            Nothing booked here has a price yet.
          </Text>
        ) : null}

        {totals.length > 0 ? <ExpensesCard totals={totals} /> : null}

        {toPay.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>To pay</SectionLabel>
            {toPay.map((item) => (
              <ItemRow key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
            ))}
          </View>
        ) : null}

        {paid.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Paid</SectionLabel>
            {paid.map((item) => (
              <ItemRow key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
            ))}
          </View>
        ) : null}

        {totals.length > 0 ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            Counts booked items, and cancelled ones marked not refundable. Ideas are not counted
            yet.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  section: { gap: spacing.md },
});
