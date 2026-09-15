import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { elevation, radius, spacing, useColors } from '../tokens';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** The design's surface card: sand fill, soft shadow, over-rounded corners. */
export function Card({ children, onPress, onLongPress, style, accessibilityLabel }: Props) {
  const c = useColors();
  const base = [styles.card, elevation.sm, { backgroundColor: c.surface, shadowColor: c.shadow }];

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
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  pressed: { opacity: 0.8 },
});
