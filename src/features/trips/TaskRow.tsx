import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortMoment } from '../../domain/format';
import { paymentStatus } from '../../domain/bookingCosts';
import type { TripItem } from '../../domain/tripItem';
import { Card } from '../../ui/components/Card';
import { Icon } from '../../ui/components/Icon';
import { PaymentTag } from '../../ui/components/PaymentTag';
import { opacity, radius, spacing, type, useColors } from '../../ui/tokens';

type Props = { task: TripItem; onToggle: () => void; onPress: () => void };

/**
 * A task on Now: tap the circle to tick it (or, once done, to un-tick it), the row to open it. A done
 * task is shown only behind *Show done* (F3), struck through.
 */
export function TaskRow({ task, onToggle, onPress }: Props) {
  const c = useColors();
  const done = task.completedAt !== null;
  // A task like "pay the deposit" with a price says whether it is paid (F7).
  const payment = paymentStatus(task);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={task.title}
      style={[styles.row, done && { opacity: opacity.dimmed }]}>
      <Pressable
        onPress={onToggle}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        style={[
          styles.check,
          { borderColor: c.accent, backgroundColor: done ? c.accent : 'transparent' },
        ]}>
        {done ? <Icon name="check" size={14} color={c.onAccent} strokeWidth={3} /> : null}
      </Pressable>
      <View style={styles.body}>
        <Text
          style={[type.heading, styles.title, { color: c.text }, done && styles.struck]}
          numberOfLines={2}>
          {task.title}
        </Text>
        {task.start ? (
          <Text style={[type.caption, { color: c.textMuted }]}>
            {formatShortMoment(task.start.local, task.start.precision)}
          </Text>
        ) : null}
      </View>
      <PaymentTag status={payment} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20 },
  struck: { textDecorationLine: 'line-through' },
});
