import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  groupItems,
  listItemInputSchema,
  listKindLabel,
  listNameSchema,
  listProgress,
  progressText,
  type ListItem,
} from '../../src/domain/lists';
import { ListItemRow } from '../../src/features/lists/ListItemRow';
import { queryView } from '../../src/hooks/queryView';
import { useBusy } from '../../src/hooks/useBusy';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  addListItem,
  deleteList,
  getList,
  LIST_TABLES,
  listListItems,
  renameList,
  saveAsReusable,
  setListItemDone,
  updateReusableFrom,
} from '../../src/repositories/lists';
import {
  listTravellers,
  listTripTravellers,
  TRAVELLER_TABLES,
} from '../../src/repositories/travellers';
import { getTrip, listTrips, TRIP_TABLES } from '../../src/repositories/trips';
import { CopyListPreviewSheet } from '../../src/features/lists/CopyListPreviewSheet';
import { AddByName } from '../../src/ui/components/AddByName';
import { Button } from '../../src/ui/components/Button';
import { Field, Input } from '../../src/ui/components/Field';
import { HeaderAction } from '../../src/ui/components/HeaderAction';
import { ListRow, Rows } from '../../src/ui/components/ListRow';
import { LoadFailed, QueryScreen, StaleNotice } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../src/ui/components/SectionLabel';
import { Sheet } from '../../src/ui/components/Sheet';
import { UndoToast } from '../../src/ui/components/UndoToast';
import { gutter, radius, spacing, type, useColors } from '../../src/ui/tokens';

/**
 * One list (C1): a trip's — ticked as things are packed or bought — or a reusable one, which has
 * no ticks and is only ever copied. Items in their groups; ticked ones fold away at the end.
 */
export default function ListScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const [moreOpen, setMoreOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [undo, setUndo] = useState<{ message: string; itemId: string } | null>(null);
  const [pickingTrip, setPickingTrip] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<{ id: string; name: string } | null>(null);
  const { data: allTrips } = useLiveQuery(listTrips, TRIP_TABLES);

  const listQuery = useLiveQuery(
    useCallback((database) => getList(database, listId), [listId]),
    LIST_TABLES,
    [listId],
  );
  const itemsQuery = useLiveQuery(
    useCallback((database) => listListItems(database, listId), [listId]),
    LIST_TABLES,
    [listId],
  );
  const list = listQuery.data;
  const tripId = list?.tripId ?? null;
  const { data: trip } = useLiveQuery(
    useCallback(async (database) => (tripId ? getTrip(database, tripId) : null), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  // Who an item can be for: the trip's travellers, or anyone for a reusable list.
  const { data: people } = useLiveQuery(
    useCallback(
      (database) => (tripId ? listTripTravellers(database, tripId) : listTravellers(database)),
      [tripId],
    ),
    TRAVELLER_TABLES,
    [tripId],
  );
  const { data: source } = useLiveQuery(
    useCallback(
      async (database) => (list?.sourceListId ? getList(database, list.sourceListId) : null),
      [list?.sourceListId],
    ),
    LIST_TABLES,
    [list?.sourceListId],
  );

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const open = useMemo(() => items.filter((item) => item.doneAt === null), [items]);
  const done = useMemo(() => items.filter((item) => item.doneAt !== null), [items]);
  const nameOf = (item: ListItem) =>
    people?.find((person) => person.id === item.travellerId)?.name ?? null;

  const view = queryView(listQuery);
  if (view !== 'ready' || !list) {
    return (
      <QueryScreen
        title="List"
        view={view}
        missingText="This list no longer exists."
        what="this list"
        onRetry={listQuery.refetch}
      />
    );
  }
  const forTrip = list.tripId !== null;
  const verb = list.kind === 'packing' ? 'Packed' : 'Bought';
  const progress = listProgress(items);

  const add = async (text: string) => {
    const input = listItemInputSchema.safeParse({ label: text });
    if (!input.success) return input.error.issues[0]?.message;
    await addListItem(db, list.id, input.data);
  };
  const toggle = (item: ListItem) => {
    const ticking = item.doneAt === null;
    void setListItemDone(db, item.id, ticking);
    setUndo(ticking ? { message: `${verb}: ${item.label}`, itemId: item.id } : null);
  };
  const openItem = (item: ListItem) =>
    router.push({ pathname: '/list-item/[itemId]', params: { itemId: item.id } });
  const row = (item: ListItem) => (
    <ListItemRow
      key={item.id}
      item={item}
      kind={list.kind}
      person={nameOf(item)}
      onToggle={forTrip ? () => toggle(item) : undefined}
      onPress={() => openItem(item)}
    />
  );

  const closeMore = () => setMoreOpen(false);
  const keepForNextTime = async () => {
    closeMore();
    await saveAsReusable(db, list.id, list.name);
    Alert.alert(
      'Kept for next time',
      `“${list.name}” is now one of your lists, without its ticks.`,
    );
  };
  const updateSource = () => {
    closeMore();
    if (!source) return;
    Alert.alert(
      `Update “${source.name}”?`,
      `Its items are replaced by this list's. Copies already in other trips stay as they are.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Update', onPress: () => void updateReusableFrom(db, list.id, source.id) },
      ],
    );
  };
  const confirmDelete = () => {
    closeMore();
    Alert.alert(
      `Delete “${list.name}”?`,
      forTrip
        ? 'Its items go with it. The reusable list it came from, if any, stays.'
        : 'Its items go with it. Copies already in trips stay.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteList(db, list.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title={list.name}
        subtitle={
          forTrip
            ? [listKindLabel(list.kind), trip?.name].filter(Boolean).join(' · ')
            : `Reusable ${listKindLabel(list.kind).toLowerCase()}`
        }
        action={
          <HeaderAction
            icon="more"
            label="More"
            accessibilityLabel="More options"
            onPress={() => setMoreOpen(true)}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StaleNotice queries={[listQuery, itemsQuery]} />
        {forTrip ? (
          <Text style={[type.bodyStrong, { color: c.text }]}>
            {progressText(list.kind, progress)}
          </Text>
        ) : (
          <View style={[styles.reusableBanner, { backgroundColor: c.surfaceSunken }]}>
            <Text style={[type.caption, { color: c.textMuted, flex: 1 }]}>
              Master list for all trips. Copy it into a trip to tick off items; this list stays
              unticked.
            </Text>
            <Button
              label="Use in a trip"
              variant="secondary"
              compact
              onPress={() => setPickingTrip(true)}
            />
          </View>
        )}

        <AddByName placeholder="Add an item" onAdd={add} />

        {queryView(itemsQuery) === 'failed' ? (
          <LoadFailed what="the items" onRetry={itemsQuery.refetch} />
        ) : (
          groupItems(open).map((group) => (
            <View key={group.category ?? 'none'} style={styles.section}>
              {group.category ? <SectionLabel>{group.category}</SectionLabel> : null}
              <Rows>{group.items.map(row)}</Rows>
            </View>
          ))
        )}
        {forTrip && open.length === 0 && items.length > 0 ? (
          <View style={[styles.allDone, { backgroundColor: c.successSoft }]}>
            <Text style={[type.bodyStrong, { color: c.success }]}>
              All {list.kind === 'packing' ? 'packed' : 'bought'}.
            </Text>
          </View>
        ) : null}

        {done.length > 0 ? (
          <View style={styles.section}>
            <HeaderAction
              label={showDone ? `Hide ${verb.toLowerCase()}` : `${verb} (${done.length})`}
              onPress={() => setShowDone((shown) => !shown)}
            />
            {showDone ? <Rows>{done.map(row)}</Rows> : null}
          </View>
        ) : null}
      </ScrollView>

      <UndoToast
        message={undo?.message ?? null}
        onUndo={() => {
          if (undo) void setListItemDone(db, undo.itemId, false);
          setUndo(null);
        }}
        onDismiss={() => setUndo(null)}
      />

      <Sheet visible={moreOpen} title={list.name} onClose={closeMore}>
        <View style={styles.actions}>
          {!forTrip ? (
            <Button
              label="Use in a trip"
              variant="secondary"
              onPress={() => {
                closeMore();
                setPickingTrip(true);
              }}
            />
          ) : null}
          <Button
            label="Rename"
            variant="secondary"
            onPress={() => {
              closeMore();
              setRenaming(true);
            }}
          />
          {forTrip ? (
            <Button
              label="Keep for next trips"
              variant="secondary"
              onPress={() => void keepForNextTime()}
            />
          ) : null}
          {forTrip && source ? (
            <Button
              label={`Update “${source.name}”`}
              variant="secondary"
              onPress={updateSource}
            />
          ) : null}
          <Button label="Delete list" variant="danger" onPress={confirmDelete} />
        </View>
      </Sheet>

      <Sheet visible={pickingTrip} title="Use in a trip" onClose={() => setPickingTrip(false)}>
        <View style={styles.actions}>
          {(allTrips ?? []).length > 0 ? (
            <Rows>
              {(allTrips ?? []).map((t) => (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={[t.startDate, t.endDate].filter(Boolean).join(' → ')}
                  onPress={() => {
                    setPickingTrip(false);
                    setSelectedTrip({ id: t.id, name: t.name });
                  }}
                />
              ))}
            </Rows>
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>
              No trips found. Create a trip first to copy this list into it.
            </Text>
          )}
        </View>
      </Sheet>

      <CopyListPreviewSheet
        visible={selectedTrip !== null}
        listId={list.id}
        tripId={selectedTrip?.id ?? null}
        tripName={selectedTrip?.name}
        onClose={() => setSelectedTrip(null)}
        onCopied={(newListId) => {
          setSelectedTrip(null);
          router.push({ pathname: '/list/[listId]', params: { listId: newListId } });
        }}
      />

      <RenameSheet
        visible={renaming}
        name={list.name}
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          await renameList(db, list.id, name);
          setRenaming(false);
        }}
      />
    </Screen>
  );
}

function RenameSheet({
  visible,
  name,
  onClose,
  onSave,
}: {
  visible: boolean;
  name: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [text, setText] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const save = async () => {
    const parsed = listNameSchema.safeParse(text);
    if (!parsed.success) setError(parsed.error.issues[0]?.message ?? 'Check the name');
    else await run(() => onSave(parsed.data));
  };
  return (
    <Sheet visible={visible} title="Rename list" onClose={onClose}>
      <View style={styles.actions}>
        <Field label="Name" error={error ?? undefined}>
          <Input value={text} onChangeText={setText} invalid={!!error} autoFocus />
        </Field>
        <Button label="Save" busy={busy} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },
  section: { gap: spacing.xs },
  actions: { gap: spacing.sm, paddingBottom: spacing.sm },
  allDone: { borderRadius: radius.lg, padding: spacing.lg },
  reusableBanner: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
