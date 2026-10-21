import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert, Text } from 'react-native';

import { formatMoney } from '../../src/domain/format';
import { PaymentForm } from '../../src/features/payments/PaymentForm';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  deleteBookingPayment,
  getBookingPayment,
  lastPayerId,
  PAYMENT_TABLES,
  updateBookingPayment,
} from '../../src/repositories/payments';
import { listTravellers, listTripTravellers } from '../../src/repositories/travellers';
import { getTripItem } from '../../src/repositories/tripItems';
import { Button } from '../../src/ui/components/Button';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

/**
 * One payment towards a booking (3D-1): edited here, and deleted only from here, after a
 * confirmation naming the amount. It stays on its booking and in its currency.
 */
export default function PaymentDetail() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();

  const query = useLiveQuery(
    useCallback(
      async (database) => {
        const payment = await getBookingPayment(database, paymentId);
        if (!payment) return null;
        const [item, members, everyone, lastPayer] = await Promise.all([
          getTripItem(database, payment.tripItemId),
          listTripTravellers(database, payment.tripId),
          listTravellers(database),
          lastPayerId(database, payment.tripId),
        ]);
        // A payer always stays a member (they cannot leave the trip), but never lose the name.
        const payer = everyone.find((person) => person.id === payment.payerId);
        const travellers =
          payer && !members.some((member) => member.id === payer.id) ? [...members, payer] : members;
        return { payment, item, travellers, lastPayer };
      },
      [paymentId],
    ),
    PAYMENT_TABLES,
    [paymentId],
  );

  const data = query.data;
  const view = queryView(query);
  if (view !== 'ready' || !data) {
    return (
      <QueryScreen
        title="Payment"
        view={view}
        missingText="This payment no longer exists."
        what="this payment"
        onRetry={query.refetch}
      />
    );
  }

  const { payment, item, travellers, lastPayer } = data;
  const amount = formatMoney(payment.amount, payment.currency);
  const confirmDelete = () =>
    Alert.alert(
      `Delete the payment of ${amount}?`,
      item
        ? `“${item.title}” will no longer show it as paid. This cannot be undone.`
        : 'This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteBookingPayment(db, payment.id);
            router.back();
          },
        },
      ],
    );

  return (
    <Screen>
      <ScreenHeader title="Payment" subtitle={item?.title} />
      <PaymentForm
        key={payment.id}
        submitLabel="Save changes"
        currency={payment.currency}
        travellers={travellers}
        lastPayerId={lastPayer}
        defaultValues={{
          amount: payment.amount,
          payerId: payment.payerId,
          paidOn: payment.paidOn,
          note: payment.note ?? undefined,
        }}
        intro={
          item?.priceAmount != null && item.priceCurrency ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Towards {formatMoney(item.priceAmount, item.priceCurrency)}
            </Text>
          ) : null
        }
        onSubmit={async (input) => {
          await updateBookingPayment(db, payment.id, input);
          router.back();
        }}
        secondaryActions={<Button label="Delete payment" variant="danger" onPress={confirmDelete} />}
      />
    </Screen>
  );
}
