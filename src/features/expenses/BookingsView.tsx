import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { expenseGroups, type CurrencyTotal } from '../../domain/bookingCosts';
import type { TripItem } from '../../domain/tripItem';
import { ItemRow } from '../../ui/components/ItemRow';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing, type, useColors } from '../../ui/tokens';
import { ExpensesCard } from '../trips/ExpensesCard';

type Props = { items: readonly TripItem[]; totals: readonly CurrencyTotal[] };

/** Priced bookings: what is still owed first, then what is paid. Each opens its item. */
export function BookingsView({ items, totals }: Props) {
  const c = useColors();
  const router = useRouter();
  const { toPay, paid } = useMemo(() => expenseGroups(items), [items]);

  if (totals.length === 0) {
    return (
      <Text style={[type.body, { color: c.textMuted }]}>
        Nothing confirmed here has a price yet. A booking's price is on its own page, under Edit.
      </Text>
    );
  }

  return (
    <View style={styles.view}>
      <ExpensesCard totals={totals} />

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

      <Text style={[type.caption, { color: c.textMuted }]}>
        Counts booked items, and cancelled ones marked not refundable. Ideas are not counted yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: spacing.xl },
  section: { gap: spacing.md },
});
