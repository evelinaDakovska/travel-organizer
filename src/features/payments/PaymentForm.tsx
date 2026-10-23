import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm, type DefaultValues } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import {
  bookingPaymentInputSchema,
  type BookingPaymentFormValues,
  type BookingPaymentInput,
} from '../../domain/bookingPayments';
import type { Traveller } from '../../domain/traveller';
import { Button } from '../../ui/components/Button';
import { DateField } from '../../ui/components/DateField';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { AmountInput } from '../../ui/components/MoneyInputs';
import { spacing, type, useColors } from '../../ui/tokens';
import { ChargedField } from './ChargedField';
import { PayerField } from './PayerField';

type Props = {
  defaultValues: DefaultValues<BookingPaymentFormValues>;
  /** Fixed: a payment is always in its booking's currency (L-3). */
  currency: string;
  /** The trip's members: who can be the payer. */
  travellers: readonly Traveller[];
  lastPayerId: string | null;
  /** The trip's reporting currency (Phase 4); null: not converted. */
  reportCurrency: string | null;
  submitLabel: string;
  onSubmit: (input: BookingPaymentInput) => Promise<void>;
  /** A line above the fields: what this pays towards. */
  intro?: ReactNode;
  secondaryActions?: ReactNode;
};

/** A payment towards one booking (3D-1): how much, who paid, when. */
export function PaymentForm({
  defaultValues,
  currency,
  travellers,
  lastPayerId,
  reportCurrency,
  submitLabel,
  onSubmit,
  intro,
  secondaryActions,
}: Props) {
  const c = useColors();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BookingPaymentFormValues, unknown, BookingPaymentInput>({
    resolver: zodResolver(bookingPaymentInputSchema),
    defaultValues,
    mode: 'onBlur',
  });

  return (
    <FormScroll
      footer={
        <Button
          label={submitLabel}
          busy={isSubmitting}
          onPress={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        />
      }>
      {intro}

      <View style={styles.row}>
        <View style={styles.grow}>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <Field label="Amount" error={errors.amount?.message}>
                <AmountInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.amount}
                  autoFocus={defaultValues.amount === undefined}
                />
              </Field>
            )}
          />
        </View>
        <View style={styles.currency}>
          <Field label="Currency" hint="The booking's">
            <Text style={[type.bodyStrong, styles.fixed, { color: c.text }]}>{currency}</Text>
          </Field>
        </View>
      </View>

      {/* Asked only for a booking in another currency than the trip's reporting one (Phase 4); a
          charged amount already saved is always shown, so it can be cleared. */}
      {defaultValues.charged || (reportCurrency !== null && reportCurrency !== currency) ? (
        <Controller
          control={control}
          name="charged"
          render={({ field }) => (
            <ChargedField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              reportCurrency={reportCurrency ?? field.value?.currency ?? ''}
              error={errors.charged?.message ?? errors.charged?.amount?.message}
            />
          )}
        />
      ) : null}

      {/* A solo trip has nobody else to have paid: no payer to record (plan §7). */}
      {travellers.length > 1 ? (
        <Controller
          control={control}
          name="payerId"
          render={({ field }) => (
            <PayerField
              value={field.value ?? null}
              onChange={field.onChange}
              travellers={travellers}
              lastPayerId={lastPayerId}
              error={errors.payerId?.message}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="paidOn"
        render={({ field }) => (
          <Field label="Date" error={errors.paidOn?.message}>
            <DateField value={field.value ?? ''} onChange={field.onChange} invalid={!!errors.paidOn} />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="note"
        render={({ field }) => (
          <Field label="Note" error={errors.note?.message} hint="Optional">
            <Input
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Deposit"
            />
          </Field>
        )}
      />

      {secondaryActions}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1 },
  currency: { width: 110 },
  fixed: { paddingVertical: spacing.md },
});
