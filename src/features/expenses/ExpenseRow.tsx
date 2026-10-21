import { Text } from 'react-native';

import { formatMoney } from '../../domain/format';
import { categoryLabel, expenseTitle, type Expense } from '../../domain/spending';
import { Icon } from '../../ui/components/Icon';
import { ListRow } from '../../ui/components/ListRow';
import { type, useColors } from '../../ui/tokens';

type Props = {
  expense: Expense;
  receipts: number;
  /** How many people it is split between (3D-2); 0 when not split. */
  splitBetween?: number;
  onPress: () => void;
};

/** One expense as a row: what, how many receipts, and the amount at the end (B8). */
export function ExpenseRow({ expense, receipts, splitBetween = 0, onPress }: Props) {
  const c = useColors();
  const title = expenseTitle(expense);
  // The category is the title when there is no label; say it only once.
  const category = expense.label ? categoryLabel(expense.category) : null;
  const receiptNote = receipts > 0 ? `${receipts} receipt${receipts === 1 ? '' : 's'}` : null;
  const splitNote = splitBetween > 0 ? `Split ${splitBetween} way${splitBetween === 1 ? '' : 's'}` : null;
  const amount = formatMoney(expense.amount, expense.currency);

  return (
    <ListRow
      title={title}
      subtitle={[category, receiptNote, splitNote].filter(Boolean).join(' · ') || null}
      leading={<Icon name={expense.category} size={22} color={c.accentText} />}
      trailing={<Text style={[type.figure, { color: c.text }]}>{amount}</Text>}
      onPress={onPress}
      accessibilityLabel={`${title}, ${amount}`}
    />
  );
}
