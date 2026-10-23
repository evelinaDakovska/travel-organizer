import type { Charged } from '../../domain/conversion';
import { Field } from '../../ui/components/Field';
import { AmountInput } from '../../ui/components/MoneyInputs';

type Props = {
  /** Null: nothing charged. Undefined is read the same. */
  value: Charged | null | undefined;
  onChange: (charged: Charged | null) => void;
  onBlur: () => void;
  /** The trip's reporting currency: what a new charged amount is in. */
  reportCurrency: string;
  error?: string;
};

/**
 * What a record really cost in the trip's reporting currency (Phase 4), from a card statement or a
 * receipt: optional, and used as it is in the converted total instead of an estimate. One saved in
 * another currency (an earlier reporting currency) is edited in that currency, never relabelled.
 */
export function ChargedField({ value, onChange, onBlur, reportCurrency, error }: Props) {
  const currency = value?.currency ?? reportCurrency;
  return (
    <Field
      label={`Charged in ${currency}`}
      error={error}
      hint={
        currency === reportCurrency
          ? `Optional. What it actually cost in ${currency}, if you know it: the total uses it instead of the rate.`
          : `Optional. Set when ${currency} was the reporting currency; it counts only while ${currency} is.`
      }>
      <AmountInput
        value={value?.amount}
        onChange={(amount) => onChange(amount === undefined ? null : { amount, currency })}
        onBlur={onBlur}
        invalid={!!error}
      />
    </Field>
  );
}
