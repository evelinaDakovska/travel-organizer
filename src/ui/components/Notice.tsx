import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type, useColors } from '../tokens';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  children?: ReactNode;
  /** `attention` for something the person should weigh before going on; `info` for a plain fact. */
  tone?: 'attention' | 'info';
  icon?: IconName;
};

/** A boxed note inside a screen: a missing document, an earlier import, a partial export. */
export function Notice({ title, children, tone = 'attention', icon }: Props) {
  const c = useColors();
  const attention = tone === 'attention';
  return (
    <View
      style={[styles.box, { backgroundColor: attention ? c.attentionSoft : c.surfaceSunken }]}
      accessibilityRole={attention ? 'alert' : undefined}>
      <Icon
        name={icon ?? (attention ? 'warning' : 'file')}
        size={18}
        color={attention ? c.attention : c.textMuted}
      />
      <View style={styles.body}>
        <Text style={[type.label, { color: c.text }]}>{title}</Text>
        {typeof children === 'string' ? (
          <Text style={[type.caption, { color: c.text }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  body: { flex: 1, gap: spacing.xs },
});
