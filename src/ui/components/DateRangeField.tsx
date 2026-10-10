import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addMonths,
  inRange,
  monthGrid,
  monthOf,
  monthTitle,
  selectRangeDay,
  WEEKDAY_INITIALS,
  type DateRange,
} from '../../domain/calendar';
import { formatDateRange, formatDuration } from '../../domain/format';
import { tripDurationDays } from '../../domain/trip';
import { opacity, radius, spacing, type, useColors } from '../tokens';
import { Button } from './Button';
import { Icon } from './Icon';
import { PickerButton } from './PickerButton';

type Props = {
  start: string;
  end: string;
  /** Both ends at once, 'YYYY-MM-DD', end never before start. */
  onChange: (start: string, end: string) => void;
  invalid?: boolean;
};

/**
 * A trip's first and last day, picked on one calendar: tap the first day, then the last.
 * Android's own picker has no range mode, so the month is drawn here. Nothing changes until
 * *Use these dates*, so backing out leaves the form as it was.
 */
export function DateRangeField({ start, end, onChange, invalid = false }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | null>(null);
  const [month, setMonth] = useState(() => monthOf(start));

  const show = () => {
    setRange({ start, end });
    setMonth(monthOf(start));
    setOpen(true);
  };

  const confirm = () => {
    if (!range) return;
    // A single tap is a one-day trip.
    onChange(range.start, range.end ?? range.start);
    setOpen(false);
  };

  const summary = range
    ? range.end
      ? `${formatDateRange(range.start, range.end)} · ${formatDuration(
          tripDurationDays({ startDate: range.start, endDate: range.end }),
        )}`
      : 'Now tap the last day'
    : '';

  return (
    <>
      <PickerButton
        value={start && end ? formatDateRange(start, end) : null}
        detail={
          start && end ? formatDuration(tripDurationDays({ startDate: start, endDate: end })) : null
        }
        placeholder="Pick the dates"
        onPress={show}
        invalid={invalid}
      />

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.background, paddingBottom: spacing.xl + insets.bottom },
          ]}>
          <View style={styles.header}>
            <Text style={[type.title, styles.grow, { color: c.text }]}>Trip dates</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button">
              <Text style={[type.bodyStrong, { color: c.accentText }]}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={[type.body, { color: c.textMuted }]}>
            Tap the first day, then the last.
          </Text>

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setMonth((m) => addMonths(m, -1))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Previous month">
              <Icon name="back" />
            </Pressable>
            <Text style={[type.heading, { color: c.text }]}>{monthTitle(month)}</Text>
            <Pressable
              onPress={() => setMonth((m) => addMonths(m, 1))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Next month">
              <Icon name="forward" />
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAY_INITIALS.map((initial, i) => (
              <Text key={i} style={[type.caption, styles.cell, { color: c.textMuted }]}>
                {initial}
              </Text>
            ))}
          </View>

          {monthGrid(month).map((week, w) => (
            <View key={w} style={styles.week}>
              {week.map((day, d) => {
                if (day === null) return <View key={d} style={styles.cell} />;
                const isEnd = day === range?.start || day === range?.end;
                const between = !isEnd && inRange(range, day);
                return (
                  <Pressable
                    key={d}
                    onPress={() => setRange((r) => selectRangeDay(r, day))}
                    accessibilityRole="button"
                    accessibilityLabel={day}
                    accessibilityState={{ selected: isEnd || between }}
                    style={({ pressed }) => [
                      styles.cell,
                      styles.day,
                      between && { backgroundColor: c.accentSoft },
                      isEnd && { backgroundColor: c.accent },
                      { opacity: pressed ? opacity.pressed : 1 },
                    ]}>
                    <Text
                      style={[
                        type.body,
                        { color: isEnd ? c.onAccent : between ? c.accentText : c.text },
                      ]}>
                      {Number(day.slice(8))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.grow} />

          <Text style={[type.bodyStrong, styles.summary, { color: c.text }]}>{summary}</Text>
          <Button label="Use these dates" disabled={!range} onPress={confirm} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  week: { flexDirection: 'row' },
  cell: { flex: 1, textAlign: 'center' },
  day: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    margin: 2,
  },
  grow: { flex: 1 },
  summary: { textAlign: 'center' },
});
