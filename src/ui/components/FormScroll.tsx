import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../tokens';

type Props = { children: ReactNode; contentStyle?: ViewStyle };

/**
 * The scrolling body of every form. The app draws edge to edge, where Android no longer resizes
 * the window for the keyboard (`adjustResize` has no effect), so the view pads itself instead —
 * otherwise the last field sits behind the keyboard. The bottom inset keeps the final button
 * clear of the navigation bar.
 */
export function FormScroll({ children, contentStyle }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxxl + insets.bottom },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl },
});
