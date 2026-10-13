import { useRouter } from 'expo-router';

import { TRIP_ITEM_KINDS, kindLabel, type TripItemKind } from '../../domain/tripItem';
import { KindTile } from '../../ui/components/KindTile';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { Sheet } from '../../ui/components/Sheet';

/** What each kind is for, in a few words: the choice is made before the form, not inside it. */
const KIND_HINTS: Record<TripItemKind, string> = {
  transport: 'A flight, train, bus, ferry or car',
  stay: 'A hotel, apartment or any place to sleep',
  activity: 'A museum, tour, show or anything to do',
  food: 'A restaurant, café or bar',
  task: 'Something to do before or during the trip',
  other: 'Anything else worth keeping',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  /** From a day on the Timeline: the plan is for that day (B3). */
  date?: string;
  /** From Places: a saved idea rather than a plan (B7). */
  idea?: boolean;
};

/**
 * The first step of adding (B10): what kind of thing, then a form for that kind. Picking a kind
 * here is the one choice the form no longer starts with.
 */
export function AddSheet({ visible, onClose, tripId, date, idea = false }: Props) {
  const router = useRouter();

  const add = (kind: TripItemKind) => {
    onClose();
    router.push({
      pathname: '/item/new',
      params: { tripId, kind, ...(date ? { date } : {}), ...(idea ? { idea: '1' } : {}) },
    });
  };

  return (
    <Sheet visible={visible} title={idea ? 'Save a place' : 'Add to this trip'} onClose={onClose}>
      <Rows>
        {TRIP_ITEM_KINDS.filter((kind) => !(idea && kind === 'task')).map((kind) => (
          <ListRow
            key={kind}
            title={kindLabel(kind)}
            subtitle={KIND_HINTS[kind]}
            leading={<KindTile kind={kind} subkind={null} size={36} />}
            onPress={() => add(kind)}
          />
        ))}
      </Rows>
    </Sheet>
  );
}
