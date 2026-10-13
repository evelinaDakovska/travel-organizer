import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, touchTarget, type, useColors } from '../tokens';

type Props<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  labelFor: (value: T) => string;
};

/**
 * Two or three views of one screen, as underlined tabs (B7, B8): Saved | In itinerary,
 * Bookings | Spending. Switching never changes what the screen's totals mean.
 */
export function Segments<T extends string>({ value, options, onChange, labelFor }: Props<T>) {
  const c = useColors();
  return (
    <View style={[styles.bar, { borderBottomColor: c.border }]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, { borderBottomColor: selected ? c.accent : 'transparent' }]}>
            <Text
              style={[selected ? type.label : type.body, { color: selected ? c.accentText : c.textMuted }]}>
              {labelFor(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    paddingHorizontal: spacing.sm,
  },
});
