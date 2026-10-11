import { StyleSheet, Text, View } from 'react-native';

import { spacing, type, useColors } from '../tokens';

type Props = {
  label: string;
  value: string;
  detail?: string | null;
  muted?: boolean;
  /** Long-press to copy — a reference is read out at a desk or pasted into a form. */
  selectable?: boolean;
};

/** A label and its value on a detail page: 'When  Friday, 20 November · 09:20'. */
export function Fact({ label, value, detail, muted = false, selectable = false }: Props) {
  const c = useColors();
  return (
    <View style={styles.fact}>
      <Text style={[type.bodyStrong, styles.label, { color: c.text }]}>{label}</Text>
      <View style={styles.value}>
        <Text style={[type.body, { color: muted ? c.textMuted : c.text }]} selectable={selectable}>
          {value}
        </Text>
        {detail ? <Text style={[type.caption, { color: c.textMuted }]}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fact: { flexDirection: 'row', gap: spacing.lg },
  label: { width: 108 },
  value: { flex: 1, gap: 2 },
});
