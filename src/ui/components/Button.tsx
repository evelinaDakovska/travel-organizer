import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { opacity, radius, spacing, touchTarget, type, useColors, type Colors } from '../tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  /** A shorter button for rows of several actions. Still a 44 dp target. */
  compact?: boolean;
  /** A long label wraps instead of being cut at a large font. One line otherwise. */
  wrap?: boolean;
};

function look(c: Colors, variant: Variant) {
  switch (variant) {
    case 'primary':
      return { fill: c.accent, pressed: c.accentPressed, text: c.onAccent, border: c.accent };
    case 'secondary':
      return { fill: c.surface, pressed: c.surfaceSunken, text: c.accentText, border: c.border };
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
  wrap = false,
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
        <Text
          style={[compact ? type.label : type.bodyStrong, { color: colors.text }, wrap && styles.wrapped]}
          numberOfLines={wrap ? undefined : 1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  compact: { minHeight: 44, paddingHorizontal: spacing.md },
  wrapped: { textAlign: 'center', paddingVertical: spacing.sm },
});
