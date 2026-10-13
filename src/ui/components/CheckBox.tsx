import { Pressable, StyleSheet, View } from 'react-native';

import { radius, touchTarget, useColors } from '../tokens';
import { Icon } from './Icon';

type Props = {
  checked: boolean;
  onToggle: () => void;
  /** 'Mark Pack thermal layers as done'. */
  accessibilityLabel: string;
};

/**
 * A tick box at the start of a row: a task done, a thing packed. The box is small; its target is
 * 48 dp, pulled into the row's edge so the text lines up.
 */
export function CheckBox({ checked, onToggle, accessibilityLabel }: Props) {
  const c = useColors();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={styles.target}>
      <View
        style={[
          styles.box,
          { borderColor: c.accent, backgroundColor: checked ? c.accent : 'transparent' },
        ]}>
        {checked ? <Icon name="check" size={14} color={c.onAccent} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    width: touchTarget,
    height: touchTarget,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
