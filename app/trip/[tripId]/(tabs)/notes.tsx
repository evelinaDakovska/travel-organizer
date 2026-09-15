import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SearchButton } from '../../../../src/features/trips/SearchButton';
import { useTripId } from '../../../../src/features/trips/TripContext';
import { useLiveQuery } from '../../../../src/hooks/useLiveQuery';
import { listNotes, NOTE_TABLES } from '../../../../src/repositories/notes';
import { getTrip, TRIP_TABLES } from '../../../../src/repositories/trips';
import { Button } from '../../../../src/ui/components/Button';
import { Card } from '../../../../src/ui/components/Card';
import { Screen } from '../../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../../src/ui/components/ScreenHeader';
import { Tag } from '../../../../src/ui/components/Tag';
import { radius, spacing, type, useColors } from '../../../../src/ui/tokens';

export default function NotesScreen() {
  const c = useColors();
  const router = useRouter();
  const tripId = useTripId();

  const { data: trip } = useLiveQuery(
    useCallback((database) => getTrip(database, tripId), [tripId]),
    TRIP_TABLES,
    [tripId],
  );
  const { data: notes, loading } = useLiveQuery(
    useCallback((database) => listNotes(database, tripId), [tripId]),
    NOTE_TABLES,
    [tripId],
  );

  return (
    <Screen>
      <ScreenHeader title="Notes" subtitle={trip?.name} action={<SearchButton tripId={tripId} />} />

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Button
            label="New note"
            variant="secondary"
            compact
            onPress={() => router.push({ pathname: '/note/new', params: { tripId } })}
          />

          {notes && notes.length > 0 ? (
            notes.map((note) => (
              <Card
                key={note.id}
                accessibilityLabel={note.title}
                onPress={() => router.push({ pathname: '/note/[noteId]', params: { noteId: note.id } })}>
                <View style={styles.titleRow}>
                  <Text style={[type.heading, styles.title, { color: c.text }]}>{note.title}</Text>
                  {note.pinned ? <Tag label="Pinned" tone="accent" /> : null}
                </View>
                {note.body ? (
                  <Text style={[type.body, { color: c.textMuted }]}>{note.body}</Text>
                ) : null}
              </Card>
            ))
          ) : (
            <View style={[styles.well, { backgroundColor: c.surfaceSunken }]}>
              <Text style={[type.body, { color: c.textMuted }]}>
                No notes for this trip yet — door codes, Wi-Fi passwords, who to call.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: 120 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  well: { borderRadius: radius.lg, padding: spacing.lg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
