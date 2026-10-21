import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { recordRefusal, suggestedAmount } from '../../src/domain/bookingPayments';
import { formatMoney } from '../../src/domain/format';
import { deviceToday } from '../../src/domain/trip';
import { PaymentForm } from '../../src/features/payments/PaymentForm';
import { alertRefusal } from '../../src/features/payments/refusal';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { createBookingPayment, lastPayerId, PAYMENT_TABLES } from '../../src/repositories/payments';
import { listTripTravellers } from '../../src/repositories/travellers';
import { getTripItem } from '../../src/repositories/tripItems';
import { Notice } from '../../src/ui/components/Notice';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { gutter, spacing, type, useColors } from '../../src/ui/tokens';

/**
 * A payment towards one booking (3D-1): the amount starts at what is left to pay, the payer at
 * *Not recorded* with the last payer offered, the date at today. Always in the booking's currency.
 */
export default function NewPayment() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const item = await getTripItem(database, itemId);
        if (!item) return null;
        const [travellers, lastPayer] = await Promise.all([
          listTripTravellers(database, item.tripId),
          lastPayerId(database, item.tripId),
        ]);
        return { item, travellers, lastPayer };
      },
      [itemId],
    ),
    PAYMENT_TABLES,
    [itemId],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen
        title="Add a payment"
        view={view}
        missingText="This booking no longer exists."
        what="this booking"
        onRetry={query.refetch}
      />
    );
  }

  const { item, travellers, lastPayer } = data;
  const refusal = recordRefusal(item);
  if (refusal) {
    return (
      <Screen>
        <ScreenHeader title="Add a payment" leading="close" />
        <View style={styles.notice}>
          <Notice title="No payment can be recorded here">{refusal}</Notice>
        </View>
      </Screen>
    );
  }

  const left = item.priceAmount! - Math.min(item.recordedPaid, item.priceAmount!);
  return (
    <Screen>
      <ScreenHeader title="Add a payment" subtitle={item.title} leading="close" />
      <PaymentForm
        submitLabel="Save payment"
        currency={item.priceCurrency!}
        travellers={travellers}
        lastPayerId={lastPayer}
        defaultValues={{
          amount: suggestedAmount(item),
          payerId: null,
          paidOn: deviceToday(),
        }}
        intro={
          <Text style={[type.caption, { color: c.textMuted }]}>
            Price {formatMoney(item.priceAmount!, item.priceCurrency!)}
            {item.recordedPaid > 0
              ? ` · ${formatMoney(item.recordedPaid, item.priceCurrency!)} recorded`
              : ''}
            {left > 0 && !item.isPaid ? ` · ${formatMoney(left, item.priceCurrency!)} left to pay` : ''}
          </Text>
        }
        onSubmit={async (input) => {
          try {
            await createBookingPayment(db, item.id, input);
          } catch (error) {
            if (alertRefusal(error)) return;
            throw error;
          }
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { paddingHorizontal: gutter.normal, paddingTop: spacing.sm },
});
