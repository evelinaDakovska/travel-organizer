import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { opacity, radius, spacing, useColors } from '../tokens';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * A panel: a white surface with a hairline border and no shadow (B1). For a block that stands on
 * its own — a form section, a summary. Lists of peers are `ListRow`s, not cards.
 */
export function Card({ children, onPress, onLongPress, style, accessibilityLabel }: Props) {
  const c = useColors();
  const base = [styles.card, { backgroundColor: c.surface, borderColor: c.border }];

  if (!onPress && !onLongPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: opacity.pressed },
});
