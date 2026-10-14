import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import {
  amountText,
  groupItems,
  listKindLabel,
  type List,
  type ListItem,
} from '../../domain/lists';
import { useBusy } from '../../hooks/useBusy';
import {
  copyListToTrip,
  countTripCopies,
  getList,
  listListItems,
} from '../../repositories/lists';
import { Button } from '../../ui/components/Button';
import { Sheet } from '../../ui/components/Sheet';
import { radius, spacing, type, useColors } from '../../ui/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  listId: string | null;
  tripId: string | null;
  tripName?: string;
  onCopied: (newListId: string) => void;
};

/**
 * Review modal shown before copying a reusable list into a trip. Shows list kind,
 * item count, categorized breakdown, and warns if the trip already has a copy.
 */
export function CopyListPreviewSheet({
  visible,
  onClose,
  listId,
  tripId,
  tripName,
  onCopied,
}: Props) {
  const c = useColors();
  const db = useSQLiteContext();
  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [existingCopies, setExistingCopies] = useState(0);
  const [busy, run] = useBusy();

  useEffect(() => {
    if (!visible || !listId) {
      setList(null);
      setItems([]);
      setExistingCopies(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [l, itms, copies] = await Promise.all([
        getList(db, listId),
        listListItems(db, listId),
        tripId ? countTripCopies(db, tripId, listId) : Promise.resolve(0),
      ]);
      if (!cancelled) {
        setList(l);
        setItems(itms);
        setExistingCopies(copies);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, visible, listId, tripId]);

  if (!list) return null;

  const groups = groupItems(items);
  const title = `Preview: ${list.name}`;
  const copyAction = async () => {
    if (!tripId) return;
    await run(async () => {
      const newId = await copyListToTrip(db, list.id, tripId);
      onClose();
      onCopied(newId);
    });
  };

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.meta}>
          <Text style={[type.bodyStrong, { color: c.text }]}>
            {listKindLabel(list.kind)} · {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
          {tripName ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Copying to {tripName}
            </Text>
          ) : null}
        </View>

        {existingCopies > 0 ? (
          <View
            style={[styles.warningBox, { backgroundColor: c.accentSoft, borderColor: c.border }]}>
            <Text style={[type.caption, { color: c.accentText }]}>
              This trip already has {existingCopies} {existingCopies === 1 ? 'copy' : 'copies'} of
              this list. Copying it again creates a separate list; nothing is merged.
            </Text>
          </View>
        ) : null}

        <View style={styles.itemsPreview}>
          {groups.length === 0 ? (
            <Text style={[type.body, { color: c.textMuted }]}>This list is currently empty.</Text>
          ) : (
            groups.map((group) => (
              <View key={group.category ?? 'Uncategorized'} style={styles.group}>
                <Text style={[type.caption, { color: c.textMuted }]}>
                  {group.category ?? 'Uncategorized'} ({group.items.length})
                </Text>
                <View style={[styles.itemList, { backgroundColor: c.surfaceSunken }]}>
                  {group.items.map((item) => {
                    const amount = amountText(item);
                    return (
                      <View key={item.id} style={styles.itemRow}>
                        <Text style={[type.body, { color: c.text, flex: 1 }]}>{item.label}</Text>
                        {amount ? (
                          <Text style={[type.caption, { color: c.textMuted }]}>{amount}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </View>

        <Button
          label={existingCopies > 0 ? 'Copy again to this trip' : 'Copy to this trip'}
          busy={busy}
          onPress={() => void copyAction()}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingVertical: spacing.xs },
  meta: { gap: spacing.xs },
  warningBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  itemsPreview: { gap: spacing.sm },
  group: { gap: spacing.xs },
  itemList: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
