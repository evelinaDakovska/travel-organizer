import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { expenseGroups, refundNotSaid, type CurrencyTotal } from '../../domain/bookingCosts';
import { formatMoney } from '../../domain/format';
import type { TripItem } from '../../domain/tripItem';
import { Card } from '../../ui/components/Card';
import { ItemRow } from '../../ui/components/ItemRow';
import { Rows } from '../../ui/components/ListRow';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = { items: readonly TripItem[]; totals: readonly CurrencyTotal[] };

/**
 * Priced bookings (B8): how much is still to pay, then each booking — owed first, then paid. The
 * total itself is above the switch and is not repeated here.
 */
export function BookingsView({ items, totals }: Props) {
  const c = useColors();
  const router = useRouter();
  const { toPay, paid } = useMemo(() => expenseGroups(items), [items]);
  const unknownRefund = useMemo(() => refundNotSaid(items), [items]);
  const open = (itemId: string) => router.push(`/item/${itemId}`);

  if (totals.length === 0 && unknownRefund.items.length === 0) {
    return (
      <Text style={[type.body, { color: c.textMuted }]}>
        Nothing in the itinerary has a price yet. A booking’s price is on its own page, under Edit.
      </Text>
    );
  }

  return (
    <View style={styles.view}>
      {totals.map((line) => (
        <Card key={line.currency} style={styles.summary}>
          <View style={styles.split}>
            <Amount
              label="Still to pay"
              value={formatMoney(line.toPay, line.currency)}
              owed={line.toPay > 0}
            />
            <Amount label="Paid" value={formatMoney(line.paid, line.currency)} />
          </View>
          {line.lost > 0 ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Includes {formatMoney(line.lost, line.currency)} for cancelled bookings that were not
              refundable.
            </Text>
          ) : null}
        </Card>
      ))}

      {toPay.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>To pay</SectionLabel>
          <Rows>
            {toPay.map((item) => (
              <ItemRow key={item.id} item={item} headingSays onPress={() => open(item.id)} />
            ))}
          </Rows>
        </View>
      ) : null}

      {paid.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Paid</SectionLabel>
          <Rows>
            {paid.map((item) => (
              <ItemRow key={item.id} item={item} headingSays onPress={() => open(item.id)} />
            ))}
          </Rows>
        </View>
      ) : null}

      {unknownRefund.items.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel>Refund not specified</SectionLabel>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Not counted in the total. Mark each refundable or not on its page.
          </Text>
          <Rows>
            {unknownRefund.items.map((item) => (
              <ItemRow key={item.id} item={item} onPress={() => open(item.id)} />
            ))}
          </Rows>
        </View>
      ) : null}

      <Text style={[type.caption, { color: c.textMuted }]}>
        Counts what is in the itinerary, and cancellations marked not refundable. Saved ideas are
        not counted.
      </Text>
    </View>
  );
}

function Amount({ label, value, owed = false }: { label: string; value: string; owed?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.amount}>
      <Text style={[type.caption, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.figure, { color: owed ? c.attention : c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: spacing.xl },
  summary: { gap: spacing.sm },
  split: { flexDirection: 'row', gap: spacing.xl },
  amount: { flex: 1, gap: 2 },
  section: { gap: spacing.xs },
});
