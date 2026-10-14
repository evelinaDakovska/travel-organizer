import { Pressable, StyleSheet, Text } from 'react-native';

import { opacity, spacing, touchTarget, type, useColors } from '../tokens';
import { Icon, type IconName } from './Icon';

type Props = {
  /** Shown beside the icon. Without it the icon stands alone and `accessibilityLabel` names it. */
  label?: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * A header button (B2): Add, Edit, Today, Search. Labelled where there is room, so nothing is an
 * unexplained glyph, and never smaller than a 48 dp target.
 */
export function HeaderAction({ label, icon, onPress, accessibilityLabel }: Props) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
      style={({ pressed }) => [styles.action, { opacity: pressed ? opacity.pressed : 1 }]}>
      {icon ? <Icon name={icon} size={20} color={c.accentText} strokeWidth={2.4} /> : null}
      {label ? (
        <Text style={[type.label, { color: c.accentText }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
