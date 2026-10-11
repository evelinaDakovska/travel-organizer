import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { expenseGroups, refundNotSaid, type CurrencyTotal } from '../../domain/bookingCosts';
import { formatMoney } from '../../domain/format';
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
  const unknownRefund = useMemo(() => refundNotSaid(items), [items]);

  if (totals.length === 0 && unknownRefund.items.length === 0) {
    return (
      <Text style={[type.body, { color: c.textMuted }]}>
        Nothing confirmed here has a price yet. A booking's price is on its own page, under Edit.
      </Text>
    );
  }

  return (
    <View style={styles.view}>
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

      {/* Not counted, but never silently zero (R10): an unknown is not a refund. */}
      {unknownRefund.items.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Refund not specified</SectionLabel>
          <Text style={[type.body, { color: c.text }]}>
            {unknownRefund.byCurrency
              .map(({ currency, amount }) => formatMoney(amount, currency))
              .join(' · ')}{' '}
            cancelled, refund not specified — not counted above. Mark each refundable or not on its
            page.
          </Text>
          {unknownRefund.items.map((item) => (
            <ItemRow key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
          ))}
        </View>
      ) : null}

      <Text style={[type.caption, { color: c.textMuted }]}>
        Counts confirmed items, and cancelled ones marked not refundable. Ideas are not counted yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: spacing.xl },
  section: { gap: spacing.md },
});
