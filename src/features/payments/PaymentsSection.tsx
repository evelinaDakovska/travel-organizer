import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { paymentSummary, type PaymentSummary } from '../../domain/bookingCosts';
import { formatMoment, formatMoney } from '../../domain/format';
import { expenseTitle } from '../../domain/spending';
import type { TripItem } from '../../domain/tripItem';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { listItemPayments, listLinkedExpenses, PAYMENT_TABLES } from '../../repositories/payments';
import { listTravellers } from '../../repositories/travellers';
import { Button } from '../../ui/components/Button';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = { item: TripItem };

/**
 * What is paid on a booking and by whom (3D-1): the working, then every payment and linked expense,
 * then *Add a payment*. Only on a booking with a price — there is nothing to pay towards otherwise.
 */
export function PaymentsSection({ item }: Props) {
  const c = useColors();
  const router = useRouter();
  const summary = item.status === 'idea' ? null : paymentSummary(item);

  const { data } = useLiveQuery(
    useCallback(
      async (database) => {
        const [payments, linked, travellers] = await Promise.all([
          listItemPayments(database, item.id),
          listLinkedExpenses(database, item.id),
          listTravellers(database),
        ]);
        return { payments, linked, names: new Map(travellers.map((t) => [t.id, t.name])) };
      },
      [item.id],
    ),
    [...PAYMENT_TABLES, 'travellers'],
    [item.id],
  );

  if (!summary) return null;
  const payer = (id: string | null) => (id ? (data?.names.get(id) ?? 'Someone') : 'Payer not recorded');
  const records = (data?.payments.length ?? 0) + (data?.linked.length ?? 0);

  return (
    <View style={styles.section}>
      <SectionLabel>Payments</SectionLabel>
      <Text style={[type.body, { color: c.text }]}>{summaryText(summary)}</Text>
      {summary.overpaid > 0 ? (
        <Text style={[type.caption, { color: c.attention }]}>
          {formatMoney(summary.overpaid, summary.currency)} more than the price is recorded.
        </Text>
      ) : null}
      {records > 0 ? (
        <Rows>
          {data!.payments.map((payment) => (
            <ListRow
              key={payment.id}
              title={formatMoney(payment.amount, payment.currency)}
              subtitle={[payer(payment.payerId), payment.note].filter(Boolean).join(' · ')}
              detail={payment.paidOn ? formatMoment(payment.paidOn, 'date') : 'Date not recorded'}
              onPress={() => router.push(`/payment/${payment.id}`)}
            />
          ))}
          {data!.linked.map((expense) => (
            <ListRow
              key={expense.id}
              title={formatMoney(expense.amount, expense.currency)}
              subtitle={`Expense: ${expenseTitle(expense)} · ${payer(expense.payerId)}`}
              detail={formatMoment(expense.spentOn, 'date')}
              onPress={() => router.push(`/expense/${expense.id}`)}
            />
          ))}
        </Rows>
      ) : null}
      <Button
        label="Add a payment"
        variant="secondary"
        onPress={() => router.push({ pathname: '/payment/new', params: { itemId: item.id } })}
      />
    </View>
  );
}

/** "Paid EUR 100.00 of EUR 250.00 · To pay EUR 150.00", or the legacy reading (§15 *6*). */
export function summaryText(s: PaymentSummary): string {
  const money = (amount: number) => formatMoney(amount, s.currency);
  if (s.notRecorded > 0) {
    return s.recorded === 0
      ? 'Paid — not recorded by whom'
      : `Paid · ${money(s.recorded)} recorded, ${money(s.notRecorded)} not recorded by whom`;
  }
  if (s.toPay === 0) return `Paid in full · ${money(s.price)}`;
  if (s.paid === 0) return `To pay ${money(s.price)} · nothing recorded yet`;
  return `Paid ${money(s.paid)} of ${money(s.price)} · To pay ${money(s.toPay)}`;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
