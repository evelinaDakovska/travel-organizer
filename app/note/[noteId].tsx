import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { NoteForm } from '../../src/features/notes/NoteForm';
import { queryView } from '../../src/hooks/queryView';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { deleteNote, getNote, NOTE_TABLES, updateNote } from '../../src/repositories/notes';
import { Button } from '../../src/ui/components/Button';
import { QueryScreen } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';

export default function EditNote() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { noteId } = useLocalSearchParams<{ noteId: string }>();

  const noteQuery = useLiveQuery(
    useCallback((database) => getNote(database, noteId), [noteId]),
    NOTE_TABLES,
    [noteId],
  );

  const note = noteQuery.data;
  const noteView = queryView(noteQuery);
  if (noteView !== 'ready' || !note) {
    return (
      <QueryScreen
        title="Note"
        view={noteView}
        missingText="This note no longer exists."
        what="this note"
        onRetry={noteQuery.refetch}
      />
    );
  }

  const confirmDelete = () =>
    Alert.alert(`Delete ${note.title}?`, 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(db, note.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <ScreenHeader title="Note" />
      <NoteForm
        key={note.id}
        submitLabel="Save changes"
        defaultValues={{ title: note.title, body: note.body, pinned: note.pinned }}
        onSubmit={async (input) => {
          await updateNote(db, note.id, input);
          router.back();
        }}
        secondaryActions={
          <Button label="Delete note" variant="danger" onPress={confirmDelete} />
        }
      />
    </Screen>
  );
}

