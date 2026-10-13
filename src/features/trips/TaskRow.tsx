import { Pressable, StyleSheet, View } from 'react-native';

import { paymentStatus } from '../../domain/bookingCosts';
import { formatShortMoment } from '../../domain/format';
import type { TripItem } from '../../domain/tripItem';
import { Icon } from '../../ui/components/Icon';
import { ListRow } from '../../ui/components/ListRow';
import { PaymentTag } from '../../ui/components/PaymentTag';
import { radius, touchTarget, useColors } from '../../ui/tokens';

type Props = { task: TripItem; onToggle: () => void; onPress: () => void };

/**
 * A task as a row: the box ticks it (or, once done, un-ticks it), the row opens it. A done task is
 * shown only behind *Show done* (F3), struck through.
 */
export function TaskRow({ task, onToggle, onPress }: Props) {
  const c = useColors();
  const done = task.completedAt !== null;
  // A task like "pay the deposit" with a price says whether it is paid (F7).
  const payment = paymentStatus(task);

  return (
    <ListRow
      title={task.title}
      detail={task.start ? formatShortMoment(task.start.local, task.start.precision) : null}
      struck={done}
      dimmed={done}
      onPress={onPress}
      accessibilityLabel={task.title}
      footer={payment ? <PaymentTag status={payment} /> : null}
      leading={
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          style={styles.target}>
          <View
            style={[
              styles.box,
              { borderColor: c.accent, backgroundColor: done ? c.accent : 'transparent' },
            ]}>
            {done ? <Icon name="check" size={14} color={c.onAccent} strokeWidth={3} /> : null}
          </View>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  // The box is small; the target around it is not.
  target: {
    width: touchTarget,
    height: touchTarget,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
