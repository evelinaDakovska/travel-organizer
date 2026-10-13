import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Note } from '../../../../src/domain/note';
import { NoteListRow } from '../../../../src/features/notes/NoteListRow';
import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { queryView } from '../../../../src/hooks/queryView';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { listNotes, NOTE_TABLES } from '../../../../src/repositories/notes';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Button } from '../../../../src/ui/components/Button';
import { HeaderAction } from '../../../../src/ui/components/HeaderAction';
import { Rows } from '../../../../src/ui/components/ListRow';
import { LoadFailed, StaleNotice } from '../../../../src/ui/components/QueryStates';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../../src/ui/components/SectionLabel';
import { gutter, radius, spacing, type, useColors } from '../../../../src/ui/tokens';

/**
 * The trip's notes (B9): titles with two lines of each, pinned ones first. A note opens whole,
 * so a long packing list does not push the others off the screen.
 */
export default function NotesScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

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

  const notes = notesQuery.data ?? [];
  const notesView = queryView(notesQuery);
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const addNote = () => router.push({ pathname: '/note/new', params: { tripId } });
  const openNote = (note: Note) =>
    router.push({ pathname: '/note/[noteId]', params: { noteId: note.id } });

  const group = (label: string, list: readonly Note[]) =>
    list.length > 0 ? (
      <View style={styles.section}>
        <SectionLabel>{label}</SectionLabel>
        <Rows>
          {list.map((note) => (
            <NoteListRow key={note.id} note={note} onPress={() => openNote(note)} />
          ))}
        </Rows>
      </View>
    ) : null;

  return (
    <Screen>
      <ScreenHeader
        title="Notes"
        subtitle={trip?.name}
        leading={false}
        action={
          <View style={styles.headerActions}>
            <SearchButton tripId={tripId} />
            <HeaderAction icon="add" label="Add" accessibilityLabel="Add a note" onPress={addNote} />
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <StaleNotice queries={[notesQuery]} />
        {notesView === 'failed' ? (
          <LoadFailed what="the notes" onRetry={notesQuery.refetch} />
        ) : notesView === 'loading' ? (
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
            <Button label="Add a note" variant="secondary" onPress={addNote} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: { gap: spacing.xs },
  empty: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
