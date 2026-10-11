import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { queryView } from '../../../src/hooks/queryView';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import { NOTE_TABLES } from '../../../src/repositories/notes';
import { searchTrip, TRIP_ITEM_TABLES } from '../../../src/repositories/tripItems';
import { Card } from '../../../src/ui/components/Card';
import { Input } from '../../../src/ui/components/Field';
import { ItemRow } from '../../../src/ui/components/ItemRow';
import { Screen } from '../../../src/ui/components/Screen';
import { LoadFailed } from '../../../src/ui/components/QueryStates';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { SectionLabel } from '../../../src/ui/components/SectionLabel';
import { spacing, type, useColors } from '../../../src/ui/tokens';

const SEARCH_TABLES = [...TRIP_ITEM_TABLES, ...NOTE_TABLES];

export default function TripSearch() {
  const c = useColors();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [query, setQuery] = useState('');

  const searchQuery = useLiveQuery(
    useCallback((database) => searchTrip(database, tripId, query), [tripId, query]),
    SEARCH_TABLES,
    [tripId, query],
  );

  // While the next search runs, keep the last results rather than blanking on every keystroke.
  const lastResults = useRef(searchQuery.data);
  if (searchQuery.data) lastResults.current = searchQuery.data;
  const view = queryView(searchQuery);
  const results = view === 'loading' ? lastResults.current : searchQuery.data;

  const blank = query.trim() === '';
  const nothing = !blank && results && results.items.length + results.notes.length === 0;

  return (
    <Screen>
      <ScreenHeader title="Search" />

      <View style={styles.box}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Titles, places, references, notes"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {blank ? (
          <Text style={[type.body, { color: c.textMuted }]}>
            Find a booking reference, a place, or something you wrote in a note. Cancelled items
            are included.
          </Text>
        ) : null}

        {!blank && view === 'failed' ? (
          <LoadFailed what="the results" onRetry={searchQuery.refetch} />
        ) : null}

        {nothing ? (
          <Text style={[type.body, { color: c.textMuted }]}>Nothing matches “{query.trim()}”.</Text>
        ) : null}

        {results && results.items.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Items</SectionLabel>
            {results.items.map((item) => (
              <ItemRow key={item.id} item={item} onPress={() => router.push(`/item/${item.id}`)} />
            ))}
          </View>
        ) : null}

        {results && results.notes.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Notes</SectionLabel>
            {results.notes.map((note) => (
              <Card
                key={note.id}
                accessibilityLabel={note.title}
                onPress={() => router.push({ pathname: '/note/[noteId]', params: { noteId: note.id } })}>
                <Text style={[type.heading, { color: c.text }]}>{note.title}</Text>
                {note.body ? (
                  <Text style={[type.body, { color: c.textMuted }]} numberOfLines={3}>
                    {note.body}
                  </Text>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: spacing.xxxl },
  section: { gap: spacing.md },
});
