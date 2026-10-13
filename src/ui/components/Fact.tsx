import { StyleSheet, Text, View } from 'react-native';

import { type, useColors } from '../tokens';

type Props = {
  label: string;
  value: string;
  detail?: string | null;
  muted?: boolean;
  /** Long-press to copy — a reference is read out at a desk or pasted into a form. */
  selectable?: boolean;
};

/**
 * A label over its value on a detail page: 'Where' over 'Sky Ounasvaara'. Stacked rather than
 * side by side, so a large font scale wraps the value instead of squeezing it into a column.
 */
export function Fact({ label, value, detail, muted = false, selectable = false }: Props) {
  const c = useColors();
  return (
    <View style={styles.fact}>
      <Text style={[type.caption, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.body, { color: muted ? c.textMuted : c.text }]} selectable={selectable}>
        {value}
      </Text>
      {detail ? <Text style={[type.caption, { color: c.textMuted }]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fact: { gap: 2 },
});
