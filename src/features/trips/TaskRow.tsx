import { paymentStatus } from '../../domain/bookingCosts';
import { formatShortMoment } from '../../domain/format';
import type { TripItem } from '../../domain/tripItem';
import { CheckBox } from '../../ui/components/CheckBox';
import { ListRow } from '../../ui/components/ListRow';
import { PaymentTag } from '../../ui/components/PaymentTag';

type Props = { task: TripItem; onToggle: () => void; onPress: () => void };

/**
 * A task as a row: the box ticks it (or, once done, un-ticks it), the row opens it. A done task is
 * shown only behind *Show done* (F3), struck through.
 */
export function TaskRow({ task, onToggle, onPress }: Props) {
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
        <CheckBox
          checked={done}
          onToggle={onToggle}
          accessibilityLabel={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        />
      }
    />
  );
}
