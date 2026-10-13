import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';

import { formatDateRange } from '../../domain/format';
import { PickerButton } from './PickerButton';

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  invalid?: boolean;
  /** 'YYYY-MM-DD'. Days before it cannot be picked — an end before its start. */
  minDate?: string;
};

/** Stores and emits a bare 'YYYY-MM-DD' — never a Date, never an instant. */
export function DateField({ value, onChange, invalid = false, minDate }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PickerButton
        value={value ? formatDateRange(value, value) : null}
        placeholder="Pick a date"
        onPress={() => setOpen(true)}
        invalid={invalid}
      />

      {open && (
        <DateTimePicker
          mode="date"
          display="calendar"
          value={toLocalDate(minDate && value < minDate ? minDate : value)}
          minimumDate={minDate ? toLocalDate(minDate) : undefined}
          onChange={(event, picked) => {
            setOpen(false);
            if (event.type === 'set' && picked) onChange(toIsoDate(picked));
          }}
        />
      )}
    </>
  );
}

/** Builds a device-local Date so the picker opens on the intended day. */
export function toLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Number.isFinite(year) ? new Date(year, month - 1, day, 12) : new Date();
}

/** Reads device-local components, not UTC, so the chosen day is preserved. */
export function toIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
