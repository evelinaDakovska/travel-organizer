import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm, type DefaultValues } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import {
  categoryLabel,
  EXPENSE_CATEGORIES,
  expenseInputSchema,
  type ExpenseFormValues,
  type ExpenseInput,
} from '../../domain/spending';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { DateField } from '../../ui/components/DateField';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { AmountInput, CurrencyInput } from '../../ui/components/MoneyInputs';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  /** Partial: a new expense starts with only a currency and a date. */
  defaultValues: DefaultValues<ExpenseFormValues>;
  submitLabel: string;
  onSubmit: (input: ExpenseInput) => Promise<void>;
  /** The receipts section: pending files on a new expense, saved ones on an existing one. */
  receipts?: ReactNode;
  /**
   * After the fields, in the scroll — a destructive action such as Delete, kept away from the
   * Save button pinned below.
   */
  secondaryActions?: ReactNode;
};

/** Built for one hand at a till: the amount first, with the keypad already open. */
export function ExpenseForm({
  defaultValues,
  submitLabel,
  onSubmit,
  receipts,
  secondaryActions,
}: Props) {
  const c = useColors();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues, unknown, ExpenseInput>({
    resolver: zodResolver(expenseInputSchema),
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
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Field label="Currency" error={errors.currency?.message}>
                <CurrencyInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.currency}
                />
              </Field>
            )}
          />
        </View>
      </View>
      {/* A booking paid on the trip is already in the total through its price (review R9). */}
      <Text style={[type.caption, { color: c.textMuted }]}>
        Paying for something already booked? Mark that booking Paid instead — adding it here too
        counts it twice.
      </Text>

      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <Field label="Category" error={errors.category?.message}>
            <ChoiceField
              value={field.value ?? null}
              options={EXPENSE_CATEGORIES}
              labelFor={categoryLabel}
              onChange={(next) => next && field.onChange(next)}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="label"
        render={({ field }) => (
          <Field label="Label" error={errors.label?.message} hint="Optional">
            <Input
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              placeholder="Taxi to the hotel"
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="spentOn"
        render={({ field }) => (
          <Field label="Date" error={errors.spentOn?.message}>
            <DateField value={field.value} onChange={field.onChange} invalid={!!errors.spentOn} />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <Field label="Description" error={errors.notes?.message} hint="Optional">
            <Input
              value={field.value ?? ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              multiline
              style={styles.multiline}
            />
          </Field>
        )}
      />

      {receipts}

      {secondaryActions}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1 },
  currency: { width: 110 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
});
