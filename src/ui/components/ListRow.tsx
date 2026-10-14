import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { opacity, spacing, type, useColors } from '../tokens';
import { Icon } from './Icon';

type Props = {
  title: string;
  /** The line under the title: where, or what. */
  subtitle?: string | null;
  /** A second, quieter line: the date, the zone, the type. */
  detail?: string | null;
  /** A kind tile, a time column, a checkbox. */
  leading?: ReactNode;
  /** An amount, tags, an action. A chevron is drawn after it when the row opens something. */
  trailing?: ReactNode;
  /** Pills or notes under the text, such as *To pay*. */
  footer?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** A cancelled item or a done task: still there, visibly not current. */
  dimmed?: boolean;
  struck?: boolean;
};

/**
 * One row in a list of peers (B2). Rows are separated by rules, not drawn as cards: the eye reads
 * down a column of titles rather than across a stack of boxes. A row is at least 64 dp tall.
 */
export function ListRow({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  footer,
  onPress,
  accessibilityLabel,
  dimmed = false,
  struck = false,
}: Props) {
  const c = useColors();

  const content = (
    <>
      {leading}
      <View style={styles.text}>
        <Text style={[type.heading, { color: c.text }, struck && styles.struck]} numberOfLines={3}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text style={[type.caption, { color: c.textMuted }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        {footer}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {onPress ? <Icon name="forward" size={20} color={c.textMuted} /> : null}
    </>
  );

  const rowStyle = [styles.row, dimmed && { opacity: opacity.dimmed }];
  if (!onPress) return <View style={rowStyle}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: c.surfaceSunken }]}>
      {content}
    </Pressable>
  );
}

/** A column of rows with a rule between each. Empty children (null, false) leave no rule. */
export function Rows({ children }: { children: ReactNode }) {
  const c = useColors();
  const rows = Children.toArray(children);
  return (
    <View>
      {rows.map((row, index) => (
        // toArray gives each element a key from its own, so a reordered list keeps its rows.
        <Fragment key={isValidElement(row) && row.key !== null ? row.key : index}>
          {index > 0 ? <View style={[styles.rule, { backgroundColor: c.border }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { flexShrink: 0 },
  struck: { textDecorationLine: 'line-through' },
  rule: { height: StyleSheet.hairlineWidth },
});
