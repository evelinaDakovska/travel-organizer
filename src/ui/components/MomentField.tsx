import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { timezoneLabel } from '../../domain/timezones';
import {
  cityZoneConflict,
  zoneHint,
  zoneHintText,
  zoneName,
  zoneSuggestion,
} from '../../domain/zoneHints';
import { opacity, radius, spacing, type, useColors } from '../tokens';
import { DateField } from './DateField';
import { Icon } from './Icon';
import { TimeField } from './TimeField';
import { TimezoneField } from './TimezoneField';

export type MomentValue = { local: string; tz?: string };

type Props = {
  value: MomentValue | undefined;
  onChange: (value: MomentValue | undefined) => void;
  /** The trip's zone, shown as what an unset moment will be read in. */
  defaultTz: string;
  addLabel?: string;
  /** What "Add a date" fills in: 'YYYY-MM-DD', or a full moment such as the start's. */
  initial?: string;
  /** 'YYYY-MM-DD'. Earlier days are not offered. */
  minDate?: string;
  /** The city at this end of a journey, when there is one: explains a zone that came from it. */
  place?: string | null;
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
export function MomentField({
  value,
  onChange,
  defaultTz,
  addLabel = 'Add a date',
  initial,
  minDate,
  place,
}: Props) {
  const c = useColors();
  const [editingZone, setEditingZone] = useState(false);

  if (!value) {
    return (
      <Pressable
        onPress={() => onChange({ local: initial ?? today() })}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.add,
          { borderColor: c.border, opacity: pressed ? opacity.pressed : 1 },
        ]}>
        <Text style={[type.bodyStrong, { color: c.accentText }]}>{addLabel}</Text>
      </Pressable>
    );
  }

  const shownZone = zoneName(value.tz ?? defaultTz, place);
  const hint = zoneHint(place, value, defaultTz);
  const conflict = cityZoneConflict(place, value, defaultTz);
  const date = value.local.slice(0, 10);
  const time = value.local.length > 10 ? value.local.slice(11, 16) : null;

  const setDate = (next: string) => onChange({ ...value, local: time ? `${next}T${time}` : next });
  const setTime = (next: string) => onChange({ ...value, local: `${date}T${next}` });
  const clearTime = () => onChange({ ...value, local: date });

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <DateField value={date} onChange={setDate} minDate={minDate} />
        </View>
        <View style={styles.grow}>
          <TimeField value={time} onChange={setTime} />
        </View>
      </View>

      <View style={styles.row}>
        {/* A chip, not a caption: a grey label did not read as something to tap. */}
        <Pressable
          onPress={() => setEditingZone((open) => !open)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Time zone: ${shownZone}. Change`}
          accessibilityState={{ expanded: editingZone }}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: c.accentSoft, opacity: pressed ? opacity.pressed : 1 },
          ]}>
          <Icon name="zone" size={15} color={c.accentText} />
          <Text style={[type.caption, { color: c.accentText }]}>{shownZone} time</Text>
          <Icon name="expand" size={15} color={c.accentText} />
        </Pressable>
        <View style={styles.grow} />
        {time ? (
          <Pressable onPress={clearTime} hitSlop={8}>
            <Text style={[type.caption, { color: c.textMuted }]}>Remove time</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => onChange(undefined)} hitSlop={8}>
          <Text style={[type.caption, { color: c.danger }]}>Remove</Text>
        </Pressable>
      </View>

      {hint && (
        <View style={styles.hint}>
          <Text style={[type.caption, styles.grow, { color: c.textMuted }]}>
            {zoneHintText(hint)}
          </Text>
          {/* Pinned to the trip's zone, not cleared, or the city would fill it back. */}
          <Pressable
            onPress={() => onChange({ ...value, tz: defaultTz })}
            hitSlop={8}
            accessibilityRole="button">
            <Text style={[type.caption, { color: c.accentText }]}>
              Use {timezoneLabel(defaultTz)} time
            </Text>
          </Pressable>
        </View>
      )}

      {conflict && place ? (
        <View style={styles.hint}>
          <Text style={[type.caption, styles.grow, { color: c.textMuted }]}>
            {place.trim()} keeps a different clock from {timezoneLabel(value.tz!)}.
          </Text>
          {/* Offered, never applied: this zone was chosen by hand (A6). */}
          <Pressable
            onPress={() => onChange({ ...value, tz: conflict })}
            hitSlop={8}
            accessibilityRole="button">
            <Text style={[type.caption, { color: c.accentText }]}>Use {place.trim()} time</Text>
          </Pressable>
        </View>
      ) : null}

      {editingZone && (
        <View style={styles.stack}>
          <TimezoneField
            value={value.tz ?? defaultTz}
            onChange={(tz) => onChange({ ...value, tz })}
          />
          {value.tz && value.tz !== defaultTz ? (
            <Pressable
              onPress={() =>
                // Following the trip clears the zone, unless the city would fill it straight back.
                onChange(
                  zoneSuggestion(place, { local: value.local }, defaultTz)
                    ? { ...value, tz: defaultTz }
                    : { local: value.local },
                )
              }
              hitSlop={8}>
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    minHeight: 36,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  add: {
    minHeight: 48,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
