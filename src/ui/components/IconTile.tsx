import { StyleSheet, View } from 'react-native';

import { radius, useColors } from '../tokens';
import { Icon, type IconName } from './Icon';

/**
 * A consistent leading tile for shortcut rows (such as Lists, Travellers, and Documents on Overview).
 * Shares the exact geometry, rounded corners, soft accent background, and centered icon scaling as KindTile.
 */
export function IconTile({
  name,
  size = 36,
}: {
  name: IconName;
  size?: number;
}) {
  const c = useColors();
  return (
    <View
      style={[styles.tile, { width: size, height: size, backgroundColor: c.accentSoft }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Icon
        name={name}
        size={Math.round(size / 2)}
        color={c.accentText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
});
