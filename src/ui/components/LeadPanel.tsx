import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { opacity, radius, spacing, type, useColors } from '../tokens';

type Props = {
  /** What this is, above the time: 'Happening now', 'Your first departure · Fri 20 Nov'. */
  eyebrow: string;
  /** The key time, large: '06:00', '09:00–11:15'. Never truncated. */
  time?: string | null;
  title: string;
  /** Lines under the title: the route, the zone, the place. */
  lines?: readonly (string | null | undefined)[];
  /** A note in the accent, such as 'Until 11:15'. */
  note?: string | null;
  /** Pills under the text: *To pay*, *Paid*. */
  tags?: ReactNode;
  /** Buttons: the ticket first. */
  actions?: ReactNode;
  onPress?: () => void;
};

/**
 * The one highlighted thing on a screen (B2): what is happening, or what comes first. A rule on
 * the left and a large time, rather than a heavier card — peers below it are plain rows.
 */
export function LeadPanel({ eyebrow, time, title, lines = [], note, tags, actions, onPress }: Props) {
  const c = useColors();

  const body = (
    <>
      <Text style={[type.overline, { color: c.textMuted }]}>{eyebrow.toUpperCase()}</Text>
      {time ? <Text style={[type.display, { color: c.text }]}>{time}</Text> : null}
      <Text style={[type.section, { color: c.text }]}>{title}</Text>
      {lines.filter(Boolean).map((line, index) => (
        <Text key={index} style={[type.caption, { color: c.textMuted }]}>
          {line}
        </Text>
      ))}
      {note ? <Text style={[type.bodyStrong, { color: c.accentText }]}>{note}</Text> : null}
      {tags ? <View style={styles.tags}>{tags}</View> : null}
    </>
  );

  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderLeftColor: c.accent }]}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={[eyebrow, time, title].filter(Boolean).join(', ')}
          style={({ pressed }) => [styles.body, { opacity: pressed ? opacity.pressed : 1 }]}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.body}>{body}</View>
      )}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderLeftWidth: 3,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  body: { gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  actions: { gap: spacing.sm },
});
