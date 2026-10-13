import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { listKindLabel, progressText, type ListKind } from '../../../../src/domain/lists';
import type { Note } from '../../../../src/domain/note';
import { AddListSheet } from '../../../../src/features/lists/AddListSheet';
import { NoteListRow } from '../../../../src/features/notes/NoteListRow';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { queryView, type QueryState } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import {
  LIST_TABLES,
  listReusableLists,
  listTripLists,
  type ListSummary,
} from '../../../../src/repositories/lists';
import { listNotes, NOTE_TABLES } from '../../../../src/repositories/notes';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Button } from '../../../../src/ui/components/Button';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { Icon } from '../../../../src/ui/components/Icon';
import { ListRow, Rows } from '../../../../src/ui/components/ListRow';
import { LoadFailed, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { Segments } from '../../../../src/ui/components/Segments';
import { gutter, radius, spacing, type, useColors } from '../../../../src/ui/tokens';

type Section = 'notes' | ListKind;

const SECTION_LABELS: Record<Section, string> = {
  notes: 'Notes',
  packing: 'Packing',
  shopping: 'Shopping',
};

type Query<T> = QueryState<T> & { refetch: () => void };

/**
 * Notes & lists (B9, C1, FB-17). Notes — titles with two lines of each, pinned first — and the
 * trip's packing and shopping lists, each with how far along it is. Things to pack and things to
 * buy are separate lists: buying something is not packing it.
 */
export default function NotesScreen() {
  const router = useRouter();
  const tripId = useTripId();
  const [section, setSection] = useState<Section>('notes');
  const [addingList, setAddingList] = useState(false);

  const { data: trip } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const notesQuery = useLiveQuery(
    useCallback((database) => listNotes(database, tripId), [tripId]),
    NOTE_TABLES,
    [tripId],
  );
  const listsQuery = useLiveQuery(
    useCallback((database) => listTripLists(database, tripId), [tripId]),
    LIST_TABLES,
    [tripId],
  );
  const { data: reusable } = useLiveQuery(listReusableLists, LIST_TABLES);

  const addNote = () => router.push({ pathname: '/note/new', params: { tripId } });

  return (
    <Screen>
      <ScreenHeader
        title="Notes & lists"
        subtitle={trip?.name}
        leading={false}
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={tripId} />
            <HeaderAction
              icon="add"
              label="Add"
              accessibilityLabel={section === 'notes' ? 'Add a note' : `Add a ${section} list`}
              onPress={() => (section === 'notes' ? addNote() : setAddingList(true))}
            />
          </View>
        }
      />
      <View style={styles.segments}>
        <Segments
          value={section}
          options={['notes', 'packing', 'shopping'] as const}
          labelFor={(option) => SECTION_LABELS[option]}
          onChange={setSection}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {section === 'notes' ? (
          <NotesSection
            query={notesQuery}
            onAdd={addNote}
            onOpen={(note) =>
              router.push({ pathname: '/note/[noteId]', params: { noteId: note.id } })
            }
          />
        ) : (
          <ListsSection
            query={listsQuery}
            kind={section}
            onAdd={() => setAddingList(true)}
            onOpen={(list) =>
              router.push({ pathname: '/list/[listId]', params: { listId: list.id } })
            }
          />
        )}
      </ScrollView>

      {section !== 'notes' ? (
        <AddListSheet
          visible={addingList}
          onClose={() => setAddingList(false)}
          tripId={tripId}
          kind={section}
          reusable={(reusable ?? []).filter((list) => list.kind === section)}
        />
      ) : null}
    </Screen>
  );
}

function NotesSection({
  query,
  onAdd,
  onOpen,
}: {
  query: Query<Note[]>;
  onAdd: () => void;
  onOpen: (note: Note) => void;
}) {
  const c = useColors();
  const notes = query.data ?? [];
  const view = queryView(query);
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const group = (label: string, list: readonly Note[]) =>
    list.length > 0 ? (
      <View style={styles.section}>
        <SectionLabel>{label}</SectionLabel>
        <Rows>
          {list.map((note) => (
            <NoteListRow key={note.id} note={note} onPress={() => onOpen(note)} />
          ))}
        </Rows>
      </View>
    ) : null;

  return (
    <>
      <StaleNotice queries={[query]} />
      {view === 'failed' ? (
        <LoadFailed what="the notes" onRetry={query.refetch} />
      ) : view === 'loading' ? (
        <Text style={[type.body, { color: c.textMuted }]}>Loading…</Text>
      ) : notes.length > 0 ? (
        <>
          {group('Pinned', pinned)}
          {group(pinned.length > 0 ? 'All notes' : 'Notes', others)}
        </>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
          <Text style={[type.body, { color: c.textMuted }]}>
            Door codes, Wi-Fi passwords, who to call.
          </Text>
          <Button label="Add a note" variant="secondary" onPress={onAdd} />
        </View>
      )}
    </>
  );
}

function ListsSection({
  query,
  kind,
  onAdd,
  onOpen,
}: {
  query: Query<ListSummary[]>;
  kind: ListKind;
  onAdd: () => void;
  onOpen: (list: ListSummary) => void;
}) {
  const c = useColors();
  const lists = (query.data ?? []).filter((list) => list.kind === kind);
  const view = queryView(query);
  const icon = kind === 'packing' ? 'packing' : 'shoppingList';

  return (
    <>
      <StaleNotice queries={[query]} />
      {view === 'failed' ? (
        <LoadFailed what="the lists" onRetry={query.refetch} />
      ) : view === 'loading' ? (
        <Text style={[type.body, { color: c.textMuted }]}>Loading…</Text>
      ) : lists.length > 0 ? (
        <Rows>
          {lists.map((list) => (
            <ListRow
              key={list.id}
              title={list.name}
              subtitle={progressText(list.kind, list)}
              leading={<Icon name={icon} color={c.accentText} />}
              onPress={() => onOpen(list)}
            />
          ))}
        </Rows>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surfaceSunken }]}>
          <Text style={[type.body, { color: c.textMuted }]}>
            {kind === 'packing'
              ? 'What to take, ticked as it goes in the bag.'
              : 'What to get before you go, ticked as it is bought.'}
          </Text>
          <Button
            label={`Add a ${listKindLabel(kind).toLowerCase()}`}
            variant="secondary"
            onPress={onAdd}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  segments: { paddingHorizontal: gutter.normal },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.xs },
  empty: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
