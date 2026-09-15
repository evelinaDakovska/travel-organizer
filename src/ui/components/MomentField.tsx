import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { timezoneLabel } from '../../domain/timezones';
import { opacity, radius, spacing, type, useColors } from '../tokens';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
import { TimezoneField } from './TimezoneField';

export type MomentValue = { local: string; tz?: string };

type Props = {
  value: MomentValue | undefined;
  onChange: (value: MomentValue | undefined) => void;
  /** The trip's zone, shown as what an unset moment will be read in. */
  defaultTz: string;
  addLabel?: string;
};

/** Device-local, not UTC: toISOString would give yesterday for a morning east of Greenwich. */
function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Date, optional time, optional zone — the three things the model stores. Leaving the time
 * off is a real choice, not a blank field: it means the day is known and the hour is not.
 */
export function MomentField({ value, onChange, defaultTz, addLabel = 'Add a date' }: Props) {
  const c = useColors();
  const [editingZone, setEditingZone] = useState(false);

  if (!value) {
    return (
      <Pressable
        onPress={() => onChange({ local: today() })}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.add,
          { borderColor: c.border, opacity: pressed ? opacity.pressed : 1 },
        ]}>
        <Text style={[type.bodyStrong, { color: c.accentText }]}>{addLabel}</Text>
      </Pressable>
    );
  }

  const date = value.local.slice(0, 10);
  const time = value.local.length > 10 ? value.local.slice(11, 16) : null;

  const setDate = (next: string) => onChange({ ...value, local: time ? `${next}T${time}` : next });
  const setTime = (next: string) => onChange({ ...value, local: `${date}T${next}` });
  const clearTime = () => onChange({ ...value, local: date });

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <DateField value={date} onChange={setDate} />
        </View>
        <View style={styles.grow}>
          <TimeField value={time} onChange={setTime} />
        </View>
      </View>

      <View style={styles.row}>
        {time ? (
          <Pressable onPress={clearTime} hitSlop={8}>
            <Text style={[type.caption, { color: c.textMuted }]}>Remove time</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setEditingZone((open) => !open)} hitSlop={8}>
          <Text style={[type.caption, { color: c.textMuted }]}>
            {value.tz ? timezoneLabel(value.tz) : `In ${timezoneLabel(defaultTz)}`}
          </Text>
        </Pressable>
        <View style={styles.grow} />
        <Pressable onPress={() => onChange(undefined)} hitSlop={8}>
          <Text style={[type.caption, { color: c.danger }]}>Remove</Text>
        </Pressable>
      </View>

      {editingZone && (
        <View style={styles.stack}>
          <TimezoneField
            value={value.tz ?? defaultTz}
            onChange={(tz) => onChange({ ...value, tz })}
          />
          {value.tz ? (
            <Pressable onPress={() => onChange({ local: value.local })} hitSlop={8}>
              <Text style={[type.caption, { color: c.textMuted }]}>
                Use the trip&apos;s timezone
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  grow: { flex: 1 },
  add: {
    minHeight: 50,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
