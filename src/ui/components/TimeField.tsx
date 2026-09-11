import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, type, useColors } from '../tokens';

type Props = { value: string | null; onChange: (time: string) => void; placeholder?: string };

/** Emits a bare 'HH:mm' as written on the ticket — never a Date, never an instant. */
export function TimeField({ value, onChange, placeholder = 'All day' }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[type.body, { color: value ? c.text : c.textFaint }]}>
          {value ?? placeholder}
        </Text>
      </Pressable>

      {open && (
        <DateTimePicker
          mode="time"
          is24Hour
          display="clock"
          value={toDate(value)}
          onChange={(event, picked) => {
            setOpen(false);
            if (event.type === 'set' && picked) onChange(toHoursMinutes(picked));
          }}
        />
      )}
    </>
  );
}

function toDate(time: string | null): Date {
  const date = new Date();
  const [hours, minutes] = (time ?? '09:00').split(':').map(Number);
  date.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
}

function toHoursMinutes(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
