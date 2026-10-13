import { Pressable, StyleSheet, Text, View } from 'react-native';

import { opacity, radius, spacing, type, useColors } from '../tokens';
import { Icon } from './Icon';

type Props = {
  options: readonly { id: string; label: string }[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
};

/** Any number of chips on or off, each with a tick so it does not rest on colour alone. */
export function MultiChoiceField({ options, selected, onChange }: Props) {
  const c = useColors();
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((one) => one !== id) : [...selected, id]);

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const on = selected.includes(option.id);
        return (
          <Pressable
            key={option.id}
            onPress={() => toggle(option.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={option.label}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: on ? c.accentSoft : 'transparent',
                borderColor: on ? c.accent : c.border,
                opacity: pressed ? opacity.pressed : 1,
              },
            ]}>
            {on ? <Icon name="check" size={16} color={c.accentText} strokeWidth={2.6} /> : null}
            <Text style={[type.label, { color: on ? c.accentText : c.text }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
});
