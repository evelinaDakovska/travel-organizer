import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatShortMoment } from '../../domain/format';
import type { JoinCandidates } from '../../domain/participation';
import { kindLabel, subkindLabel, type TripItem } from '../../domain/tripItem';
import { Button } from '../../ui/components/Button';
import { CheckBox } from '../../ui/components/CheckBox';
import { KindTile } from '../../ui/components/KindTile';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { SectionLabel } from '../../ui/components/SectionLabel';
import { Sheet } from '../../ui/components/Sheet';
import { spacing, type, useColors } from '../../ui/tokens';

type Props = {
  /** Who joined; null hides the sheet. */
  traveller: { id: string; name: string } | null;
  candidates: JoinCandidates<TripItem>;
  onAdd: (itemIds: string[]) => Promise<void>;
  onClose: () => void;
};

function detailOf(item: TripItem): string {
  const kind = item.subkind ? subkindLabel(item.subkind) : kindLabel(item.kind);
  const when = item.start ? formatShortMoment(item.start.local, item.start.precision) : null;
  return [kind, when ?? (item.status === 'confirmed' ? 'No date yet' : null)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * *Also add Mia to…* (3B): after someone joins a trip, its plans and saved places they are not on,
 * **all unticked** — joining never adds anyone to anything by itself. Closing adds nothing.
 */
export function AddToItemsSheet({ traveller, candidates, onAdd, onClose }: Props) {
  const c = useColors();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const count = selected.size;

  const close = () => {
    if (busy) return;
    setSelected(new Set());
    onClose();
  };
  const toggle = (id: string) =>
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const section = (label: string, items: TripItem[]) =>
    items.length === 0 ? null : (
      <View style={styles.section}>
        <SectionLabel>{label}</SectionLabel>
        <Rows>
          {items.map((item) => {
            const checked = selected.has(item.id);
            return (
              <Pressable
                key={item.id}
                onPress={() => toggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`${item.title}, ${detailOf(item)}`}>
                <ListRow
                  title={item.title}
                  detail={detailOf(item)}
                  leading={
                    <View style={styles.leading}>
                      <View
                        importantForAccessibility="no-hide-descendants"
                        accessibilityElementsHidden>
                        <CheckBox
                          checked={checked}
                          onToggle={() => toggle(item.id)}
                          accessibilityLabel={`Add ${traveller?.name ?? ''} to ${item.title}`}
                        />
                      </View>
                      <KindTile kind={item.kind} subkind={item.subkind} size={32} />
                    </View>
                  }
                />
              </Pressable>
            );
          })}
        </Rows>
      </View>
    );

  return (
    <Sheet
      visible={traveller !== null}
      title={`Also add ${traveller?.name ?? ''} to…`}
      onClose={close}
      closeLabel="Not now"
      scroll={false}>
      <Text style={[type.caption, { color: c.textMuted }]}>
        Nothing is added unless you tick it. Prices and payments do not change.
      </Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {section('Plans', candidates.plans)}
        {section('Saved places', candidates.places)}
      </ScrollView>
      <Button
        label={
          count === 0
            ? 'Tick what they are going to'
            : `Add to ${count} ${count === 1 ? 'item' : 'items'}`
        }
        disabled={count === 0}
        busy={busy}
        onPress={async () => {
          if (busy || count === 0) return;
          setBusy(true);
          try {
            await onAdd([...selected]);
            setSelected(new Set());
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 420, flexShrink: 1 },
  listContent: { gap: spacing.lg },
  section: { gap: spacing.xs },
  leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
