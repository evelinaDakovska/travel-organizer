import { amountText, type ListItem, type ListKind } from '../../domain/lists';
import { CheckBox } from '../../ui/components/CheckBox';
import { ListRow } from '../../ui/components/ListRow';

type Props = {
  item: ListItem;
  kind: ListKind;
  /** The person it is for, by name. */
  person?: string | null;
  /** Ticking: only on a trip's list; a reusable list has no box. */
  onToggle?: () => void;
  onPress: () => void;
};

/** One thing on a list: what, how much, for whom — and on a trip's list, packed or bought. */
export function ListItemRow({ item, kind, person, onToggle, onPress }: Props) {
  const done = item.doneAt !== null;
  const verb = kind === 'packing' ? 'packed' : 'bought';

  return (
    <ListRow
      title={item.label}
      subtitle={[amountText(item), person, item.note].filter(Boolean).join(' · ') || null}
      struck={done}
      dimmed={done}
      onPress={onPress}
      accessibilityLabel={done ? `${item.label}, ${verb}` : item.label}
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
