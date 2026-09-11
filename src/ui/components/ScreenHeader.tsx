import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type, useColors } from '../tokens';

type Props = { title: string; action?: ReactNode };

export function ScreenHeader({ title, action }: Props) {
  const c = useColors();
  const router = useRouter();

  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={16} style={styles.back}>
        <Text style={[type.body, { color: c.accent }]}>‹ Back</Text>
      </Pressable>
      <View style={styles.titleRow}>
        <Text style={[type.title, styles.title, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1 },
});
