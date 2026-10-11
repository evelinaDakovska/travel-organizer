import { StyleSheet, View } from 'react-native';

import { itemIconKey, type TripItemKind } from '../../domain/tripItem';
import { radius, useColors } from '../tokens';
import { ItemIcon } from './Icon';

/**
 * What an item is, at a glance (F1): its icon in a quiet tile, the same for every kind. The shape
 * tells a flight from a museum; colour stays for status, so the list never becomes a rainbow.
 */
export function KindTile({
  kind,
  subkind,
  size = 40,
}: {
  kind: TripItemKind;
  subkind: string | null;
  size?: number;
}) {
  const c = useColors();
  return (
    <View
      style={[styles.tile, { width: size, height: size, backgroundColor: c.accentSoft }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <ItemIcon
        iconKey={itemIconKey(kind, subkind)}
        size={Math.round(size / 2)}
        color={c.accentText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center' },
});
