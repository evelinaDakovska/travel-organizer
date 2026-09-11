import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { formatDateRange } from '../../domain/format';
import { radius, spacing, type, useColors } from '../tokens';

type Props = { value: string; onChange: (isoDate: string) => void; invalid?: boolean };

/** Stores and emits a bare 'YYYY-MM-DD' — never a Date, never an instant. */
export function DateField({ value, onChange, invalid = false }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: c.surface,
            borderColor: invalid ? c.danger : c.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <Text style={[type.body, { color: value ? c.text : c.textFaint }]}>
          {value ? formatDateRange(value, value) : 'Pick a date'}
        </Text>
      </Pressable>

      {open && (
        <DateTimePicker
          mode="date"
          display="calendar"
          value={toLocalDate(value)}
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
function toLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Number.isFinite(year) ? new Date(year, month - 1, day, 12) : new Date();
}

/** Reads device-local components, not UTC, so the chosen day is preserved. */
function toIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
});
