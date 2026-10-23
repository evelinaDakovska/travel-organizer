import type { Charged } from '../../domain/conversion';
import { Field } from '../../ui/components/Field';
import { AmountInput } from '../../ui/components/MoneyInputs';

type Props = {
  /** Null: nothing charged. Undefined is read the same. */
  value: Charged | null | undefined;
  onChange: (charged: Charged | null) => void;
  onBlur: () => void;
  /** The trip's reporting currency: what a new charged amount is in. Null: the trip is not converted. */
  reportCurrency: string | null;
  error?: string;
};

/**
 * What a record really cost in the trip's reporting currency (Phase 4), from a card statement or a
 * receipt: optional, and used as it is in the converted total instead of an estimate. One saved in
 * another currency (an earlier reporting currency) keeps that currency and amount: it is edited in
 * it, never relabelled or converted, and counts again whenever that currency reports (review P3).
 */
export function ChargedField({ value, onChange, onBlur, reportCurrency, error }: Props) {
  const currency = value?.currency ?? reportCurrency ?? '';
  return (
    <Field
      label={`Charged in ${currency}`}
      error={error}
      hint={
        currency === reportCurrency
          ? `Optional. What it actually cost in ${currency}, if you know it: the total uses it instead of the rate.`
          : reportCurrency === null
            ? `Kept as recorded in ${currency}. The trip is not converted now; it counts whenever ${currency} is the reporting currency.`
            : `Kept as recorded in ${currency}, never converted: it counts only while the trip reports in ${currency}, not ${reportCurrency}. To use the trip's ${reportCurrency}, clear it and enter what it cost in ${reportCurrency}.`
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
