import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortMoment } from '../../domain/format';
import type { TripItem } from '../../domain/tripItem';
import { Card } from '../../ui/components/Card';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { task: TripItem; onToggle: () => void; onPress: () => void };

/** An open task on Now: tick the circle to mark it done, tap the row to open it. */
export function TaskRow({ task, onToggle, onPress }: Props) {
  const c = useColors();

  return (
    <Card onPress={onPress} accessibilityLabel={task.title} style={styles.row}>
      <Pressable
        onPress={onToggle}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false }}
        accessibilityLabel={`Mark ${task.title} as done`}
        style={[styles.check, { borderColor: c.accent }]}
      />
      <View style={styles.body}>
        <Text style={[type.heading, styles.title, { color: c.text }]} numberOfLines={2}>
          {task.title}
        </Text>
        {task.start ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            {formatShortMoment(task.start.local, task.start.precision)}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 1.5 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20 },
});
