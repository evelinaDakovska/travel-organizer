import { useState } from 'react';

import { amountText, parseAmount } from '../../domain/format';
import { Input } from './Field';

type AmountInputProps = {
  value: number | undefined;
  onChange: (minorUnits: number | undefined) => void;
  onBlur: () => void;
  invalid: boolean;
  autoFocus?: boolean;
};

/**
 * An amount in minor units. Keeps the text as typed: rendering it back from the stored number
 * can drop a decimal point the moment it is typed, so the number only flows outwards.
 *
 * Text that is not an amount ('-12', '1.234') goes out as `NaN`, which the form's schema refuses
 * with a message — never as `undefined`, which would quietly save no price at all (FB-2).
 */
export function AmountInput({ value, onChange, onBlur, invalid, autoFocus }: AmountInputProps) {
  const [text, setText] = useState(() => amountText(value));

  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        const amount = parseAmount(next);
        onChange(amount === null ? Number.NaN : amount);
      }}
      onBlur={onBlur}
      keyboardType="decimal-pad"
      placeholder="25.00"
      invalid={invalid}
      autoFocus={autoFocus}
    />
  );
}

type CurrencyInputProps = {
  value: string | undefined;
  onChange: (currency: string | undefined) => void;
  onBlur: () => void;
  invalid: boolean;
};

/**
 * Three capital letters, as typed. The text is kept here rather than read back from the form:
 * react-hook-form shows a field's default while its value is undefined, so clearing 'EUR' to type
 * 'CHF' put 'EUR' straight back and the keyboard then typed onto it.
 */
export function CurrencyInput({ value, onChange, onBlur, invalid }: CurrencyInputProps) {
  const [text, setText] = useState(value ?? '');

  return (
    <Input
      value={text}
      onChangeText={(next) => {
        const currency = next.toUpperCase().slice(0, 3);
        setText(currency);
        onChange(currency || undefined);
      }}
      onBlur={onBlur}
      autoCapitalize="characters"
      maxLength={3}
      placeholder="EUR"
      invalid={invalid}
    />
  );
}
