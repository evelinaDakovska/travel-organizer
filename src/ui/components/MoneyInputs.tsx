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
 */
export function AmountInput({ value, onChange, onBlur, invalid, autoFocus }: AmountInputProps) {
  const [text, setText] = useState(() => amountText(value));

  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(parseAmount(next));
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

/** Three capital letters, as typed. */
export function CurrencyInput({ value, onChange, onBlur, invalid }: CurrencyInputProps) {
  return (
    <Input
      value={value ?? ''}
      onChangeText={(text) => onChange(text.toUpperCase().slice(0, 3) || undefined)}
      onBlur={onBlur}
      autoCapitalize="characters"
      maxLength={3}
      placeholder="EUR"
      invalid={invalid}
    />
  );
}
