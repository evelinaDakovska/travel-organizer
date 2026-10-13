import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { gutter, opacity, radius, spacing, touchTarget, type, useColors } from '../tokens';

/** Long enough to read and reach for — Material suggests 4–10 s — short enough not to linger. */
const SHOWN_MS = 8000;

type Props = {
  /** Null hides it. Each new message restarts the timer. */
  message: string | null;
  onUndo: () => void;
  onDismiss: () => void;
};

/**
 * 'Task done · Undo' along the bottom (B5): a change that was one tap away from a mistake can be
 * taken back for a few seconds. Announced, so it is not visual only.
 */
export function UndoToast({ message, onUndo, onDismiss }: Props) {
  const c = useColors();
  // The timer follows the message alone: a parent re-rendering must not keep the toast up.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(`${message}. Undo available.`);
    const timer = setTimeout(() => dismiss.current(), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <View style={[styles.toast, { backgroundColor: c.text }]} accessibilityLiveRegion="polite">
      <Text style={[type.body, styles.message, { color: c.background }]}>{message}</Text>
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        style={({ pressed }) => [styles.undo, { opacity: pressed ? opacity.pressed : 1 }]}>
        <Text style={[type.label, { color: c.background }]}>Undo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: gutter.normal,
    right: gutter.normal,
    bottom: spacing.lg,
    borderRadius: radius.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: { flex: 1, paddingVertical: spacing.md },
  undo: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
