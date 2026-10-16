import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, gutter, opacity, radius, spacing, type, useColors } from '../tokens';
import { Button } from './Button';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The button at the bottom. 'Close' unless said otherwise. */
  closeLabel?: string;
  /** Whether to wrap children in a ScrollView. Defaults to true. */
  scroll?: boolean;
};

/**
 * A bottom sheet over the screen, for a short choice: which document to open, what to add, the
 * actions behind More. Tapping outside or Back closes it.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  closeLabel = 'Close',
  scroll = true,
}: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: opacity.scrim }]} />
      </Pressable>
      <View
        style={[
          styles.sheet,
          elevation.md,
          {
            backgroundColor: c.surface,
            shadowColor: c.shadow,
            paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
          },
        ]}
        accessibilityViewIsModal>
        <Text style={[type.section, { color: c.text }]} accessibilityRole="header">
          {title}
        </Text>
        {scroll ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
        <Button label={closeLabel} variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  scroll: { maxHeight: 460 },
  content: { gap: spacing.xs },
});
