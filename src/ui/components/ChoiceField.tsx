import { Pressable, StyleSheet, Text, View } from 'react-native';

import { opacity, radius, spacing, type, useColors } from '../tokens';

type Props<T extends string> = {
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => void;
  labelFor?: (value: T) => string;
  /** Tapping the selected chip clears it — for anything genuinely optional. */
  clearable?: boolean;
};

export function ChoiceField<T extends string>({
  value,
  options,
  onChange,
  labelFor = (v) => v,
  clearable = false,
}: Props<T>) {
  const c = useColors();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(selected && clearable ? null : option)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected ? c.accent : 'transparent',
                borderColor: selected ? c.accent : c.border,
                opacity: pressed ? opacity.pressed : 1,
              },
            ]}>
            <Text style={[type.label, { color: selected ? c.onAccent : c.text }]}>
              {labelFor(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
});
