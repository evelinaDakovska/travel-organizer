import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { opacity, radius, spacing, type, useColors, type Colors } from '../tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  /** A shorter pill for rows of several actions. */
  compact?: boolean;
};

function look(c: Colors, variant: Variant) {
  switch (variant) {
    case 'primary':
      return { fill: c.accent, pressed: c.accentPressed, text: c.onAccent, border: c.accent };
    case 'secondary':
      return { fill: 'transparent', pressed: c.surfaceSunken, text: c.text, border: c.border };
    case 'ghost':
      return { fill: 'transparent', pressed: c.accentSoft, text: c.accentText, border: 'transparent' };
    case 'danger':
      return { fill: 'transparent', pressed: c.dangerSoft, text: c.danger, border: c.danger };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  compact = false,
}: Props) {
  const c = useColors();
  const colors = look(c, variant);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      // Without an explicit label Android derives one from the children, and it keeps "busy" from
      // the spinner after the label text comes back.
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        {
          backgroundColor: pressed ? colors.pressed : colors.fill,
          borderColor: colors.border,
          opacity: disabled ? opacity.disabled : 1,
        },
      ]}>
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={[type.heading, compact && styles.compactLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  compact: { minHeight: 44, paddingHorizontal: spacing.lg },
  compactLabel: { fontSize: 15, lineHeight: 20 },
});
