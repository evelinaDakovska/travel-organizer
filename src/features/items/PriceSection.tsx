import { useRef, useState } from 'react';
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormSetValue,
} from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { refundableOf, withRefundable } from '../../domain/bookingCosts';
import { formatMoney } from '../../domain/format';
import { pricingOf, pricingTotal, withPricing, type DraftPricing } from '../../domain/pricing';
import type { TripItemFormValues } from '../../domain/tripItem';
import { ChoiceField } from '../../ui/components/ChoiceField';
import { Disclosure } from '../../ui/components/Disclosure';
import { Field, Input } from '../../ui/components/Field';
import { Icon } from '../../ui/components/Icon';
import { AmountInput, CurrencyInput } from '../../ui/components/MoneyInputs';
import { opacity, radius, spacing, touchTarget, type, useColors } from '../../ui/tokens';

type Props = {
  control: Control<TripItemFormValues>;
  errors: FieldErrors<TripItemFormValues>;
  setValue: UseFormSetValue<TripItemFormValues>;
  getValues: UseFormGetValues<TripItemFormValues>;
  /** Starts open: the item already has a price, or is marked paid. */
  initiallyOpen: boolean;
  /** People ticked as going (C2): a per-person price starts priced for them. */
  goingCount: number;
};

/**
 * A rate line as the form edits it: the price may be half-typed (NaN) or not yet there. `key`
 * keeps each line's own typed text with it when another line is removed.
 */
type DraftLine = { key: number; label: string; quantity: number; unitAmount: number | undefined };

/**
 * Price & payment (B10, C3): a total, or a price per person — rates with how many people at each,
 * the total worked out as they are typed. Whatever is shown is what is saved: the breakdown goes in
 * `details.pricing` and its total in the price, and the item's schema refuses the two disagreeing.
 */
export function PriceSection({
  control,
  errors,
  setValue,
  getValues,
  initiallyOpen,
  goingCount,
}: Props) {
  const c = useColors();
  const [priceAmount, priceCurrency, isPaid, details] = useWatch({
    control,
    name: ['priceAmount', 'priceCurrency', 'isPaid', 'details'],
  });
  // Keys are counted here, not in the module, so they stay unique however the module reloads.
  const keys = useRef(0);
  const newLine = (quantity: number, unitAmount?: number, label = ''): DraftLine => ({
    key: keys.current++,
    label,
    quantity,
    unitAmount,
  });
  const [lines, setLines] = useState<DraftLine[]>(
    () =>
      pricingOf(getValues('details'))?.lines.map((line) =>
        newLine(line.quantity, line.unitAmount, line.label ?? ''),
      ) ?? [],
  );
  const perPerson = lines.length > 0;
  const refundable = refundableOf(details);
  const currency = priceCurrency ?? 'EUR';

  /**
   * Writes the breakdown and the total it makes, together, into the form. Until every rate has a
   * price there is no total, and the item's schema says which rate is missing one.
   */
  const applyLines = (next: DraftLine[]) => {
    setLines(next);
    const pricing: DraftPricing = {
      mode: 'perPerson',
      lines: next.map((line) => ({
        ...(line.label.trim() ? { label: line.label.trim() } : {}),
        quantity: line.quantity,
        unitAmount: line.unitAmount,
      })),
    };
    const rates = next.flatMap((line) =>
      line.unitAmount !== undefined && Number.isFinite(line.unitAmount)
        ? [{ quantity: line.quantity, unitAmount: line.unitAmount }]
        : [],
    );
    const total = rates.length === next.length ? pricingTotal(rates) : null;
    setValue('details', withPricing(getValues('details'), pricing), { shouldDirty: true });
    setValue('priceAmount', total ?? undefined, {
      shouldDirty: true,
      shouldValidate: !!errors.priceAmount,
    });
  };

  const switchTo = (mode: 'total' | 'perPerson') => {
    if (mode === 'total') {
      // The total stays; only the breakdown goes.
      setLines([]);
      setValue('details', withPricing(getValues('details'), null), { shouldDirty: true });
      return;
    }
    const people = Math.max(1, goingCount);
    const current = getValues('priceAmount');
    // A total that divides evenly becomes the rate; otherwise the rate is left to type.
    const even =
      current !== undefined && Number.isFinite(current) && current % people === 0
        ? current / people
        : undefined;
    applyLines([newLine(people, even)]);
  };

  const updateLine = (index: number, change: Partial<DraftLine>) =>
    applyLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  const priced = perPerson ? lines.reduce((sum, line) => sum + line.quantity, 0) : 0;
  const summary = [
    priceAmount !== undefined && Number.isFinite(priceAmount)
      ? formatMoney(priceAmount, currency)
      : null,
    perPerson ? `per person, for ${priced}` : null,
    isPaid ? 'Paid' : null,
    refundable === null ? null : refundable ? 'Refundable' : 'Not refundable',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Disclosure
      title="Price & payment"
      summary={summary || 'Optional'}
      initiallyOpen={initiallyOpen}
      forceOpen={!!errors.priceAmount || !!errors.priceCurrency}>
      <ChoiceField
        value={perPerson ? 'perPerson' : 'total'}
        options={['total', 'perPerson'] as const}
        labelFor={(mode) => (mode === 'total' ? 'Total price' : 'Per person')}
        onChange={(mode) => mode && switchTo(mode)}
      />

      {perPerson ? (
        <View style={styles.rates}>
          {lines.map((line, index) => (
            <View key={line.key} style={[styles.rate, { borderColor: c.border }]}>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <Field label="Rate, optional">
                    <Input
                      value={line.label}
                      onChangeText={(label) => updateLine(index, { label })}
                      placeholder={index === 0 ? 'Adult' : 'Child'}
                      maxLength={40}
                    />
                  </Field>
                </View>
                <View style={styles.amount}>
                  <Field label={`Each, ${currency}`}>
                    <AmountInput
                      value={line.unitAmount}
                      onChange={(unitAmount) => updateLine(index, { unitAmount })}
                      onBlur={() => undefined}
                      invalid={line.unitAmount !== undefined && !Number.isFinite(line.unitAmount)}
                    />
                  </Field>
                </View>
              </View>
              <View style={styles.row}>
                <Stepper
                  value={line.quantity}
                  onChange={(quantity) => updateLine(index, { quantity })}
                  label={line.label.trim() || 'people'}
                />
                <View style={styles.grow} />
                {lines.length > 1 ? (
                  <Pressable
                    onPress={() => applyLines(lines.filter((_, i) => i !== index))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove the rate ${line.label.trim() || index + 1}`}
                    style={styles.remove}>
                    <Text style={[type.label, { color: c.danger }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          <Pressable
            onPress={() => applyLines([...lines, newLine(1)])}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addRate, { opacity: pressed ? opacity.pressed : 1 }]}>
            <Icon name="add" size={18} color={c.accentText} />
            <Text style={[type.label, { color: c.accentText }]}>Add a rate</Text>
          </Pressable>

          <View style={styles.total}>
            <Text style={[type.caption, { color: c.textMuted }]}>Total</Text>
            <Text style={[type.display, { color: c.text }]}>
              {priceAmount !== undefined && Number.isFinite(priceAmount)
                ? formatMoney(priceAmount, currency)
                : '—'}
            </Text>
            {errors.priceAmount?.message ? (
              <Text style={[type.caption, { color: c.danger }]}>
                {errors.priceAmount.message}
              </Text>
            ) : null}
            {/* Who is going may change after the price was set: say so, never re-price (C3). */}
            {goingCount > 0 && priced !== goingCount ? (
              <View style={styles.row}>
                <Text style={[type.caption, styles.grow, { color: c.attention }]}>
                  Priced for {priced}; {goingCount} {goingCount === 1 ? 'is' : 'are'} going.
                </Text>
                {lines.length === 1 ? (
                  <Pressable
                    onPress={() => updateLine(0, { quantity: goingCount })}
                    accessibilityRole="button"
                    style={styles.remove}>
                    <Text style={[type.label, { color: c.accentText }]}>
                      Price for {goingCount}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <Controller
            control={control}
            name="priceCurrency"
            render={({ field }) => (
              <Field label="Currency" error={errors.priceCurrency?.message}>
                <View style={styles.currency}>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.priceCurrency}
                  />
                </View>
              </Field>
            )}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.grow}>
            <Controller
              control={control}
              name="priceAmount"
              render={({ field }) => (
                <Field label="Price" error={errors.priceAmount?.message}>
                  <AmountInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.priceAmount}
                  />
                </Field>
              )}
            />
          </View>
          <View style={styles.currency}>
            <Controller
              control={control}
              name="priceCurrency"
              render={({ field }) => (
                <Field label="Currency" error={errors.priceCurrency?.message}>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!errors.priceCurrency}
                  />
                </Field>
              )}
            />
          </View>
        </View>
      )}

      <Controller
        control={control}
        name="isPaid"
        render={({ field }) => (
          <Field label="Paid">
            <ChoiceField
              value={field.value ? 'paid' : 'unpaid'}
              options={['unpaid', 'paid'] as const}
              labelFor={(v) => (v === 'paid' ? 'Paid' : 'Not paid yet')}
              onChange={(next) => field.onChange(next === 'paid')}
            />
          </Field>
        )}
      />

      {priceAmount !== undefined && (
        // Not a second Controller: `details` already has one in TransportFields.
        <Field
          label="Refundable"
          hint="Optional. A cancelled booking that is not refundable still counts in the expenses">
          <ChoiceField
            value={refundable === null ? null : refundable ? 'yes' : 'no'}
            options={['yes', 'no'] as const}
            labelFor={(v) => (v === 'yes' ? 'Refundable' : 'Not refundable')}
            onChange={(next) => {
              const value = next === null ? null : next === 'yes';
              setValue('details', withRefundable(getValues('details'), value), {
                shouldDirty: true,
              });
            }}
            clearable
          />
        </Field>
      )}
    </Disclosure>
  );
}

/** − n + for a whole number of people, never below one. */
function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  /** What is counted, for a screen reader: 'Adult', 'people'. */
  label: string;
}) {
  const c = useColors();
  const step = (delta: 1 | -1, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(value + delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'One more' : 'One fewer'}, ${label}`}
      style={[styles.step, { borderColor: c.border, opacity: disabled ? opacity.disabled : 1 }]}>
      <Text style={[type.section, { color: c.accentText }]}>{delta > 0 ? '+' : '−'}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${value} ${label}`}>
      {step(-1, value <= 1)}
      <Text style={[type.figure, styles.count, { color: c.text }]}>{value}</Text>
      {step(1, false)}
    </View>
  );
}

const styles = StyleSheet.create({
  rates: { gap: spacing.md },
  rate: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  amount: { width: 130 },
  currency: { width: 110 },
  remove: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.xs },
  addRate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget,
    alignSelf: 'flex-start',
  },
  total: { gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: {
    width: touchTarget,
    height: touchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { minWidth: 28, textAlign: 'center' },
});
