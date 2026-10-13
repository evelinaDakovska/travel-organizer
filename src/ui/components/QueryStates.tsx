import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { isStale, type QueryState, type QueryView } from '../../hooks/queryView';
import { opacity, radius, spacing, type, useColors } from '../tokens';
import { Icon } from './Icon';
import { Screen } from './Screen';
import { ScreenHeader } from './ScreenHeader';

type Retryable = QueryState<unknown> & { refetch: () => void };

function RetryLink({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? opacity.pressed : 1 })}>
      <Text style={[type.bodyStrong, { color: c.accentText }]}>Try again</Text>
    </Pressable>
  );
}

/**
 * A whole screen for a record that cannot be shown yet: loading, a read that failed, or one that
 * worked and found the record gone. Only `missing` may say it no longer exists.
 */
export function QueryScreen({
  title,
  view,
  missingText,
  what,
  onRetry,
}: {
  title: string;
  /** Anything but missing or failed shows the spinner. */
  view: QueryView;
  /** 'This trip no longer exists.' */
  missingText: string;
  /** 'this trip', for 'Could not load this trip.' */
  what: string;
  onRetry: () => void;
}) {
  const c = useColors();
  return (
    <Screen>
      <ScreenHeader title={title} />
      <View style={styles.centre}>
        {view !== 'missing' && view !== 'failed' ? <ActivityIndicator color={c.accent} /> : null}
        {view === 'missing' ? (
          <Text style={[type.body, { color: c.textMuted }]}>{missingText}</Text>
        ) : null}
        {view === 'failed' ? <LoadFailed what={what} onRetry={onRetry} /> : null}
      </View>
    </Screen>
  );
}

/** In place of a list that could not be read — never "nothing here". */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  const c = useColors();
  return (
    <View style={styles.failed} accessibilityRole="alert">
      <Text style={[type.body, styles.centredText, { color: c.textMuted }]}>
        Could not load {what}. It tries again by itself.
      </Text>
      <RetryLink onPress={onRetry} />
    </View>
  );
}

/**
 * Over a screen whose data is from an earlier read because the latest one failed. Shown while any
 * of the queries is stale; Try again re-reads each of those.
 */
export function StaleNotice({ queries }: { queries: readonly Retryable[] }) {
  const c = useColors();
  const stale = queries.filter(isStale);
  if (stale.length === 0) return null;

  return (
    <View
      style={[styles.notice, { backgroundColor: c.attentionSoft }]}
      accessibilityRole="alert">
      <Icon name="warning" size={18} color={c.attention} />
      <Text style={[type.caption, styles.grow, { color: c.text }]}>
        Could not refresh. Showing what was loaded before.
      </Text>
      <RetryLink onPress={() => stale.forEach((query) => query.refetch())} />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  failed: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  centredText: { textAlign: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  grow: { flex: 1 },
});
