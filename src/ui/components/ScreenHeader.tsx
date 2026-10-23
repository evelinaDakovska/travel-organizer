import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { breaksInsideWord } from '../../domain/format';
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
  // On a narrow phone at a large font, the actions can leave the titles too little room: a word
  // broken in two ('Expense' / 's'), the trip cut short ('Lapland, F…'), the dates cut short. Beside
  // the actions the lines are laid out unlimited and checked; when one does not fit, the actions
  // take a row of their own above the titles, for these texts.
  const texts = [context, title, subtitle].join('\n');
  const [stackedFor, setStackedFor] = useState<string | null>(null);
  const stacked = !!action && stackedFor === texts;
  // Beside the actions, nothing is cut: a line that does not fit stacks the header instead.
  const measuring = !!action && !stacked;
  const fits = (fit: boolean) => {
    if (measuring && !fit) setStackedFor(texts);
  };

  const back = leading ? (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={leading === 'close' ? 'Close' : 'Back'}
      style={styles.leading}>
      <Icon name={leading} size={24} color={c.text} strokeWidth={2.4} />
    </Pressable>
  ) : null;

  const titles = (
    <View style={[styles.titles, stacked && styles.stackedTitles]}>
      {/* Ink, not muted: which trip is open must read at a glance, yet stay below the title. */}
      {context ? (
        <Text
          style={[type.bodyStrong, { color: c.text }]}
          numberOfLines={measuring ? undefined : 2}
          onTextLayout={(e) => {
            const lines = e.nativeEvent.lines.map((line) => line.text);
            fits(lines.length <= 2 && !breaksInsideWord(lines));
          }}>
          {context}
        </Text>
      ) : null}
      {/* Two lines, not one: a long trip name wraps at a large font scale rather than vanish. */}
      <Text
        style={[type.title, { color: c.text }]}
        numberOfLines={2}
        accessibilityRole="header"
        onTextLayout={(e) => fits(!breaksInsideWord(e.nativeEvent.lines.map((line) => line.text)))}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[type.caption, { color: c.textMuted }]}
          numberOfLines={measuring ? undefined : 1}
          onTextLayout={(e) => fits(e.nativeEvent.lines.length <= 1)}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (stacked) {
    return (
      <View style={[styles.header, styles.stacked]}>
        <View style={styles.actionRow}>
          {back}
          <View style={styles.actionEnd}>{action}</View>
        </View>
        {titles}
      </View>
    );
  }

  return (
    <View style={styles.header}>
      {back}
      {titles}
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
  stacked: { flexDirection: 'column', alignItems: 'stretch', paddingTop: spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionEnd: { flex: 1, alignItems: 'flex-end' },
  leading: { padding: spacing.xs, marginLeft: -spacing.xs },
  titles: { flex: 1, gap: 2 },
  // `flex: 1` would size the titles from zero in a column of no fixed height.
  stackedTitles: { flex: 0 },
});
