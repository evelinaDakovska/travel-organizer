import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gutter, spacing, useColors } from '../tokens';

type Props = {
  children: ReactNode;
  contentStyle?: ViewStyle;
  /** Kept in view below the fields — the Save button — and above the keyboard (B10). */
  footer?: ReactNode;
};

/**
 * The scrolling body of every form. The app draws edge to edge, where Android no longer resizes
 * the window for the keyboard (`adjustResize` has no effect), so the view pads itself instead —
 * otherwise the last field sits behind the keyboard. The bottom inset keeps the last control
 * clear of the navigation bar.
 */
export function FormScroll({ children, contentStyle, footer }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, spacing.md);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footer ? spacing.xl : spacing.xxxl + bottom },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={[
            styles.footer,
            { borderTopColor: c.border, backgroundColor: c.background, paddingBottom: bottom },
          ]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter.normal, paddingTop: spacing.lg, gap: spacing.xl },
  footer: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
});
