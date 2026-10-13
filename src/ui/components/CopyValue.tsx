import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { opacity, spacing, touchTarget, type, useColors } from '../tokens';

type Props = {
  /** 'Booking reference'. */
  label: string;
  value: string;
};

const CONFIRMATION_MS = 2000;

/**
 * A value worth pasting somewhere else — a booking reference at a check-in desk's website — with a
 * labelled Copy (B4). The value stays selectable too, for copying part of it.
 */
export function CopyValue({ label, value }: Props) {
  const c = useColors();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility(`${label} copied`);
  };

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[type.caption, { color: c.textMuted }]}>{label}</Text>
        <Text style={[type.figure, { color: c.text }]} selectable>
          {value}
        </Text>
      </View>
      <Pressable
        onPress={() => void copy()}
        accessibilityRole="button"
        accessibilityLabel={`Copy ${label.toLowerCase()}`}
        style={({ pressed }) => [styles.button, { opacity: pressed ? opacity.pressed : 1 }]}>
        <Text style={[type.label, { color: c.accentText }]}>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  button: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
});
