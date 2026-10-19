import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { gutter, spacing, type, useColors } from '../tokens';
import { Icon } from './Icon';

type Props = {
  /** Where this screen belongs, above the title: the trip on a trip's tab. */
  context?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** `false` for a screen you cannot go back from, such as a tab. */
  leading?: 'back' | 'close' | false;
};

export function ScreenHeader({ context, title, subtitle, action, leading = 'back' }: Props) {
  const c = useColors();
  const router = useRouter();

  return (
    <View style={styles.header}>
      {leading ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={leading === 'close' ? 'Close' : 'Back'}
          style={styles.leading}>
          <Icon name={leading} size={24} color={c.text} strokeWidth={2.4} />
        </Pressable>
      ) : null}

      <View style={styles.titles}>
        {/* Ink, not muted: which trip is open must read at a glance, yet stay below the title. */}
        {context ? (
          <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={2}>
            {context}
          </Text>
        ) : null}
        {/* Two lines, not one: a long trip name wraps at a large font scale rather than vanish. */}
        <Text style={[type.title, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  leading: { padding: spacing.xs, marginLeft: -spacing.xs },
  titles: { flex: 1, gap: 2 },
});
