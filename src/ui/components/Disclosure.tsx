import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, touchTarget, type, useColors } from '../tokens';
import { Icon } from './Icon';

type Props = {
  title: string;
  /** What is inside, while it is closed: 'EUR 240.00 · Paid'. */
  summary?: string | null;
  /** Starts open — for a section that already holds something (B10). */
  initiallyOpen?: boolean;
  /** Open whatever was chosen, e.g. while a field inside has an error. */
  forceOpen?: boolean;
  children: ReactNode;
};

/**
 * A folding part of a form (B10): optional fields stay out of the way until wanted. Folding only
 * hides them — the values stay in the form and are saved — and a section with something in it
 * starts open, so nothing saved is ever out of sight.
 */
export function Disclosure({ title, summary, initiallyOpen = false, forceOpen = false, children }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(initiallyOpen);
  const shown = open || forceOpen;

  return (
    <View style={[styles.block, { borderTopColor: c.border }]}>
      <Pressable
        onPress={() => setOpen(!shown)}
        accessibilityRole="button"
        accessibilityState={{ expanded: shown }}
        style={styles.head}>
        <View style={styles.text}>
          <Text style={[type.section, { color: c.text }]}>{title}</Text>
          {!shown && summary ? (
            <Text style={[type.caption, { color: c.textMuted }]}>{summary}</Text>
          ) : null}
        </View>
        <Icon name={shown ? 'expand' : 'forward'} size={20} color={c.textMuted} />
      </Pressable>
      {shown ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs },
  head: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
  body: { gap: spacing.xl, paddingTop: spacing.sm },
});
