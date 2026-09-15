import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { NoteForm } from '../../src/features/notes/NoteForm';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { deleteNote, getNote, NOTE_TABLES, updateNote } from '../../src/repositories/notes';
import { Button } from '../../src/ui/components/Button';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function EditNote() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { noteId } = useLocalSearchParams<{ noteId: string }>();

  const { data: note, loading } = useLiveQuery(
    useCallback((database) => getNote(database, noteId), [noteId]),
    NOTE_TABLES,
    [noteId],
  );

  if (loading || !note) {
    return (
      <Screen>
        <ScreenHeader title="Note" />
        <View style={styles.centre}>
          {loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <Text style={[type.body, { color: c.textMuted }]}>This note no longer exists.</Text>
          )}
        </View>
      </Screen>
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
        footer={<Button label="Delete note" variant="danger" onPress={confirmDelete} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
