import { amountText, type ListItem, type ListKind } from '../../domain/lists';
import { CheckBox } from '../../ui/components/CheckBox';
import { ListRow } from '../../ui/components/ListRow';

type Props = {
  item: ListItem;
  kind: ListKind;
  /** Who it is for, as one line — *Evelina, Misho* or *Everyone* (`recipientsLine`). */
  forWhom?: string | null;
  /** Ticking: only on a trip's list; a reusable list has no box. */
  onToggle?: () => void;
  onPress: () => void;
};

/** One thing on a list: what, how much, for whom — and on a trip's list, packed or bought. */
export function ListItemRow({ item, kind, forWhom, onToggle, onPress }: Props) {
  const done = item.doneAt !== null;
  const verb = kind === 'packing' ? 'packed' : 'bought';
  const forText = forWhom ? `For ${forWhom}` : null;
  const name = forWhom ? `${item.label}, for ${forWhom}` : item.label;

  return (
    <ListRow
      title={item.label}
      subtitle={[amountText(item), forText, item.note].filter(Boolean).join(' · ') || null}
      struck={done}
      dimmed={done}
      onPress={onPress}
      accessibilityLabel={done ? `${name}, ${verb}` : name}
      leading={
        onToggle ? (
          <CheckBox
            checked={done}
            onToggle={onToggle}
            accessibilityLabel={done ? `${item.label}: not ${verb}` : `Mark ${item.label} ${verb}`}
          />
        ) : null
      }
    />
  );
}
