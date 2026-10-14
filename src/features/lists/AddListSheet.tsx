import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { listKindLabel, type ListKind } from '../../domain/lists';
import { createList, type ListSummary } from '../../repositories/lists';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { ListRow, Rows } from '../../ui/components/ListRow';
import { Sheet } from '../../ui/components/Sheet';
import { spacing, type, useColors } from '../../ui/tokens';
import { CopyListPreviewSheet } from './CopyListPreviewSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  kind: ListKind;
  /** The reusable lists of this kind, offered to copy. */
  reusable: readonly ListSummary[];
  mode?: 'all' | 'saved';
};

/**
 * A list for the trip (C1): choose a saved list to preview and copy, or create an empty one.
 */
export function AddListSheet({
  visible,
  onClose,
  tripId,
  kind,
  reusable,
  mode = 'all',
}: Props) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [previewListId, setPreviewListId] = useState<string | null>(null);

  const openList = (listId: string) =>
    router.push({ pathname: '/list/[listId]', params: { listId } });

  const startEmpty = async () => {
    onClose();
    const name = kind === 'packing' ? 'Packing' : 'Shopping';
    openList(await createList(db, { tripId, kind, name }));
  };

  const handleClose = () => {
    setPreviewListId(null);
    onClose();
  };

  const isSavedMode = mode === 'saved';
  const title = isSavedMode
    ? `Use a saved ${listKindLabel(kind).toLowerCase()}`
    : `Add a ${listKindLabel(kind).toLowerCase()}`;

  return (
    <>
      <Sheet visible={visible && !previewListId} title={title} onClose={handleClose}>
        <View style={styles.content}>
          {reusable.length > 0 ? (
            <Rows>
              {reusable.map((source) => (
                <ListRow
                  key={source.id}
                  title={source.name}
                  subtitle={`Preview & copy · ${source.total} item${source.total === 1 ? '' : 's'}`}
                  leading={
                    <Icon
                      name={kind === 'packing' ? 'packing' : 'shoppingList'}
                      color={c.accentText}
                    />
                  }
                  onPress={() => setPreviewListId(source.id)}
                />
              ))}
            </Rows>
          ) : isSavedMode ? (
            <View style={styles.emptyContainer}>
              <Text style={[type.body, { color: c.textMuted }]}>
                No saved {listKindLabel(kind).toLowerCase()}s yet.
              </Text>
              <Text style={[type.caption, { color: c.textMuted }]}>
                Lists you keep for every trip live under Lists & templates on Your trips, or you
                can save any trip list for future trips from its menu.
              </Text>
              <Button
                label="Start with a blank list"
                variant="secondary"
                onPress={() => void startEmpty()}
              />
            </View>
          ) : null}

          {!isSavedMode ? (
            <Rows>
              <ListRow
                title="An empty list"
                subtitle="Start from nothing"
                leading={<Icon name="add" color={c.accentText} />}
                onPress={() => void startEmpty()}
              />
            </Rows>
          ) : null}

          {!isSavedMode && reusable.length === 0 ? (
            <Text style={[type.caption, { color: c.textMuted }]}>
              Lists you keep for every trip live under Lists & templates, on Your trips.
            </Text>
          ) : null}
        </View>
      </Sheet>

      <CopyListPreviewSheet
        visible={previewListId !== null}
        listId={previewListId}
        tripId={tripId}
        onClose={() => setPreviewListId(null)}
        onCopied={(newListId) => {
          setPreviewListId(null);
          onClose();
          openList(newListId);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.xs },
  emptyContainer: { gap: spacing.sm, paddingVertical: spacing.sm },
});
