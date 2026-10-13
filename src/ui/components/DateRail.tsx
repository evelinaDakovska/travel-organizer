import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gutter, opacity, radius, spacing, touchTarget, type, useColors } from '../tokens';
import { Icon } from './Icon';
import { toIsoDate, toLocalDate } from './DateField';

export type RailStop = {
  key: string;
  /** 'Day 3', 'Before', 'No date'. */
  label: string;
  /** 'Sun 22'. */
  sublabel?: string;
  /** Marked with the word, not only a colour. */
  today?: boolean;
  /** 'Day 3, Sunday 22 November, today'. */
  accessibilityLabel: string;
};

type Props = {
  stops: readonly RailStop[];
  selected: string;
  onSelect: (key: string) => void;
  /**
   * For a long trip, a calendar to jump to a day without scrolling the rail. Gets the first and
   * last day; the picked 'YYYY-MM-DD' is passed to `onPickDate`.
   */
  pickRange?: { first: string; last: string };
  onPickDate?: (date: string) => void;
};

/**
 * The days of a trip as a row of stops (B3): scrolls sideways rather than shrinking the days to
 * fit, so every stop keeps a 48 dp target however long the trip. The selected stop is kept in view.
 */
export function DateRail({ stops, selected, onSelect, pickRange, onPickDate }: Props) {
  const c = useColors();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());
  const [picking, setPicking] = useState(false);

  const reveal = (key: string, animated: boolean) => {
    const x = offsets.current.get(key);
    if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - gutter.normal), animated });
  };

  useEffect(() => reveal(selected, true), [selected]);

  return (
    <View style={[styles.bar, { borderBottomColor: c.border }]}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        accessibilityRole="tablist">
        {stops.map((stop) => {
          const isSelected = stop.key === selected;
          const ink = isSelected ? c.onAccent : c.text;
          const muted = isSelected ? c.onAccent : c.textMuted;
          return (
            <Pressable
              key={stop.key}
              onLayout={(event) => {
                offsets.current.set(stop.key, event.nativeEvent.layout.x);
                if (stop.key === selected) reveal(stop.key, false);
              }}
              onPress={() => onSelect(stop.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={stop.accessibilityLabel}
              style={({ pressed }) => [
                styles.stop,
                {
                  backgroundColor: isSelected ? c.accent : 'transparent',
                  borderColor: isSelected ? c.accent : stop.today ? c.accentText : c.border,
                  opacity: pressed ? opacity.pressed : 1,
                },
              ]}>
              <Text style={[type.tag, { color: muted }]} numberOfLines={1}>
                {stop.label}
              </Text>
              {stop.sublabel ? (
                <Text style={[type.label, { color: ink }]} numberOfLines={1}>
                  {stop.sublabel}
                </Text>
              ) : null}
              {stop.today ? (
                <Text style={[type.tag, { color: isSelected ? c.onAccent : c.accentText }]}>
                  Today
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {pickRange && onPickDate ? (
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick a day from the calendar"
            style={({ pressed }) => [
              styles.stop,
              styles.calendar,
              { borderColor: c.border, opacity: pressed ? opacity.pressed : 1 },
            ]}>
            <Icon name="timeline" size={20} color={c.accentText} />
          </Pressable>
        ) : null}
      </ScrollView>

      {picking && pickRange && onPickDate ? (
        <DateTimePicker
          mode="date"
          display="calendar"
          value={toLocalDate(pickRange.first)}
          minimumDate={toLocalDate(pickRange.first)}
          maximumDate={toLocalDate(pickRange.last)}
          onChange={(event, picked) => {
            setPicking(false);
            if (event.type === 'set' && picked) onPickDate(toIsoDate(picked));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  rail: { gap: spacing.xs, paddingHorizontal: gutter.normal, paddingVertical: spacing.sm },
  stop: {
    minWidth: 64,
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendar: { minWidth: touchTarget },
});
