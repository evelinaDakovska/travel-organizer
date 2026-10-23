import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch, type DefaultValues } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { paidOf } from '../../domain/bookingCosts';
import { linkableBookings, possibleDuplicates } from '../../domain/bookingPayments';
import { formatMoney } from '../../domain/format';
import {
  categoryLabel,
  EXPENSE_CATEGORIES,
  expenseInputSchema,
  type ExpenseFormValues,
  type ExpenseInput,
} from '../../domain/spending';
import type { Traveller } from '../../domain/traveller';
import type { TripItem } from '../../domain/tripItem';
import { Button } from '../../ui/components/Button';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { DateField } from '../../ui/components/DateField';
import { Field, Input } from '../../ui/components/Field';
import { FormScroll } from '../../ui/components/FormScroll';
import { AmountInput, CurrencyInput } from '../../ui/components/MoneyInputs';
import { SelectField } from '../../ui/components/SelectField';
import { spacing } from '../../ui/tokens';
import { askAboutDuplicate } from '../payments/askAboutDuplicate';
import { ChargedField } from '../payments/ChargedField';
import { PayerField } from '../payments/PayerField';

/** Who could have paid and what an expense could pay for (3D-1). */
export type ExpenseMoneyContext = {
  travellers: readonly Traveller[];
  /** Every item of the trip; the form offers the ones an expense in its currency can pay for. */
  bookings: readonly TripItem[];
  lastPayerId: string | null;
  /** The trip's reporting currency (Phase 4); null: not converted. Absent in older callers. */
  reportCurrency?: string | null;
};

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
  money: ExpenseMoneyContext;
  /** A new expense: before saving one that looks like a booking's price, offer to link it. */
  warnDuplicates?: boolean;
};

/** Built for one hand at a till: the amount first, with the keypad already open. */
export function ExpenseForm({
  defaultValues,
  submitLabel,
  onSubmit,
  receipts,
  secondaryActions,
  money,
  warnDuplicates = false,
}: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues, unknown, ExpenseInput>({
    resolver: zodResolver(expenseInputSchema),
    defaultValues,
    mode: 'onBlur',
  });
  const [currency, tripItemId, charged] = useWatch({ control, name: ['currency', 'tripItemId', 'charged'] });
  const report = money.reportCurrency ?? null;
  // Asked only when it can matter: a trip converted to another currency than this expense's. A
  // charged amount already saved is always shown, so it can be seen and cleared.
  const askCharged = !!charged || (report !== null && (currency ?? '').toUpperCase() !== report);
  const byId = new Map(money.bookings.map((booking) => [booking.id, booking]));
  const linkable = linkableBookings(money.bookings, (currency ?? '').toUpperCase()).map((b) => b.id);
  // The one linked now stays visible even if the currency no longer fits: saving says why.
  const bookingOptions = tripItemId && !linkable.includes(tripItemId) ? [tripItemId, ...linkable] : linkable;
  const linked = tripItemId ? byId.get(tripItemId) : undefined;

  const save = handleSubmit(async (values) => {
    if (warnDuplicates && values.tripItemId === null) {
      const [booking] = possibleDuplicates(values, money.bookings);
      if (booking) {
        const choice = await askAboutDuplicate(booking.title);
        if (choice === 'back') return;
        if (choice === 'link') values = { ...values, tripItemId: booking.id };
      }
    }
    await onSubmit(values);
  });

  return (
    <FormScroll
      footer={
        <Button label={submitLabel} busy={isSubmitting} onPress={save} />
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
      {/* A booking's price is already in the total (R9): an expense that pays for it is linked,
          so it counts once (3D-1). */}
      <Controller
        control={control}
        name="tripItemId"
        render={({ field }) => (
          <Field
            label="For a booking"
            error={errors.tripItemId?.message}
            hint={
              linked
                ? 'Counts as paid on that booking, not as spending of its own.'
                : 'Paying for something already booked? Choose it, so it is counted once.'
            }>
            <SelectField
              title="Pays for"
              value={field.value ?? null}
              options={bookingOptions}
              onChange={field.onChange}
              noneLabel="None — spending of its own"
              labelFor={(id) => byId.get(id)?.title ?? 'A booking no longer here'}
              detailFor={(id) => {
                const booking = byId.get(id);
                if (!booking?.priceAmount || !booking.priceCurrency) return null;
                const left = booking.priceAmount - paidOf(booking);
                return `${formatMoney(booking.priceAmount, booking.priceCurrency)}${
                  left > 0 ? ` · ${formatMoney(left, booking.priceCurrency)} left to pay` : ' · Paid'
                }`;
              }}
            />
          </Field>
        )}
      />

      {askCharged ? (
        <Controller
          control={control}
          name="charged"
          render={({ field }) => (
            <ChargedField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              reportCurrency={report ?? field.value?.currency ?? ''}
              error={errors.charged?.message ?? errors.charged?.amount?.message}
            />
          )}
        />
      ) : null}

      {money.travellers.length > 1 ? (
        <Controller
          control={control}
          name="payerId"
          render={({ field }) => (
            <PayerField
              value={field.value ?? null}
              onChange={field.onChange}
              travellers={money.travellers}
              lastPayerId={money.lastPayerId}
              error={errors.payerId?.message}
            />
          )}
        />
      ) : null}

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
