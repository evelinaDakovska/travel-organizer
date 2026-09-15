import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, Text, View } from 'react-native';

import { NoteForm } from '../../src/features/notes/NoteForm';
import { createNote } from '../../src/repositories/notes';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { type, useColors } from '../../src/ui/tokens';

export default function NewNote() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();

  if (!tripId) {
    return (
      <Screen>
        <ScreenHeader title="New note" leading="close" />
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>Nothing to add this note to.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="New note" leading="close" />
      <NoteForm
        submitLabel="Save note"
        defaultValues={{ title: '', body: '', pinned: false }}
        onSubmit={async (input) => {
          await createNote(db, tripId, input);
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
