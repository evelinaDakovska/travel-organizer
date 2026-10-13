import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Text } from 'react-native';

import { listKindLabel, type ListKind } from '../../domain/lists';
import {
  copyListToTrip,
  countTripCopies,
  createList,
  type ListSummary,
} from '../../repositories/lists';
import { Icon } from '../../ui/components/Icon';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { Sheet } from '../../ui/components/Sheet';
import { type, useColors } from '../../ui/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  kind: ListKind;
  /** The reusable lists of this kind, offered to copy. */
  reusable: readonly ListSummary[];
};

/**
 * A list for the trip (C1): a copy of a reusable one — its own from then on, ticks cleared — or an
 * empty one. Copying one the trip already has a copy of asks first; nothing is merged.
 */
export function AddListSheet({ visible, onClose, tripId, kind, reusable }: Props) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const openList = (listId: string) =>
    router.push({ pathname: '/list/[listId]', params: { listId } });

  const copy = async (source: ListSummary) => {
    onClose();
    const copyIt = async () => openList(await copyListToTrip(db, source.id, tripId));
    if ((await countTripCopies(db, tripId, source.id)) === 0) return copyIt();
    Alert.alert(
      `This trip already has “${source.name}”`,
      'Copy it again? The new copy is a separate list; nothing is merged.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Copy again', onPress: () => void copyIt() },
      ],
    );
  };

  const startEmpty = async () => {
    onClose();
    const name = kind === 'packing' ? 'Packing' : 'Shopping';
    openList(await createList(db, { tripId, kind, name }));
  };

  return (
    <Sheet
      visible={visible}
      title={`Add a ${listKindLabel(kind).toLowerCase()}`}
      onClose={onClose}>
      <Rows>
        {reusable.map((source) => (
          <ListRow
            key={source.id}
            title={source.name}
            subtitle={`Copy · ${source.total} item${source.total === 1 ? '' : 's'}`}
            leading={
              <Icon name={kind === 'packing' ? 'packing' : 'shoppingList'} color={c.accentText} />
            }
            onPress={() => void copy(source)}
          />
        ))}
        <ListRow
          title="An empty list"
          subtitle="Start from nothing"
          leading={<Icon name="add" color={c.accentText} />}
          onPress={() => void startEmpty()}
        />
      </Rows>
      {reusable.length === 0 ? (
        <Text style={[type.caption, { color: c.textMuted }]}>
          Lists you keep for every trip live under Lists & templates, on Your trips.
        </Text>
      ) : null}
    </Sheet>
  );
}
