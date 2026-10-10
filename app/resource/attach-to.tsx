import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { timelineEntries } from '../../src/domain/timeline';
import type { TripItem } from '../../src/domain/tripItem';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import {
  attachResourceToItem,
  getResource,
  itemsSharingResource,
  RESOURCE_TABLES,
  resourceTripId,
} from '../../src/repositories/resources';
import { listTripItems } from '../../src/repositories/tripItems';
import { ItemRow } from '../../src/ui/components/ItemRow';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { spacing, type, useColors } from '../../src/ui/tokens';

type Choices = { label: string; items: TripItem[]; holding: Set<string> };

/**
 * Attaches a document to an item of the same trip as well — the museum tickets saved with the
 * trip, shown on the museum visit. The item gets a second row pointing at the same file.
 */
export default function AttachTo() {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { resourceId } = useLocalSearchParams<{ resourceId: string }>();

  const { data, loading } = useLiveQuery(
    useCallback(
      async (database): Promise<Choices | null> => {
        const [resource, tripId] = await Promise.all([
          getResource(database, resourceId),
          resourceTripId(database, resourceId),
        ]);
        if (!resource || !tripId) return null;
        const [items, holding] = await Promise.all([
          listTripItems(database, tripId),
          itemsSharingResource(database, resourceId),
        ]);
        return { label: resource.label, items, holding: new Set(holding) };
      },
      [resourceId],
    ),
    [...RESOURCE_TABLES, 'trip_items'],
    [resourceId],
  );

  const ordered = useMemo(() => (data ? inTimelineOrder(data.items) : []), [data]);

  const attach = async (item: TripItem) => {
    try {
      await attachResourceToItem(db, resourceId, item.id);
      router.back();
    } catch (error) {
      console.warn('Attach to item failed', error);
      Alert.alert('Could not attach', 'Nothing was changed. Try again.');
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Attach to an item" subtitle={data?.label} />
      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : !data ? (
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This attachment no longer exists.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[type.body, { color: c.textMuted }]}>
            It stays where it is and shows on the item too. One copy of the file is kept for both.
          </Text>
          {ordered.map((item) =>
            data.holding.has(item.id) ? (
              <View key={item.id} style={styles.held}>
                <ItemRow item={item} onPress={() => undefined} />
                <Text style={[type.caption, { color: c.textMuted }]}>Already attached here</Text>
              </View>
            ) : (
              <ItemRow key={item.id} item={item} onPress={() => void attach(item)} />
            ),
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

/** Dated items as the timeline orders them, then the undated ones by title. */
function inTimelineOrder(items: readonly TripItem[]): TripItem[] {
  const dated = timelineEntries(items.filter((item) => item.status !== 'cancelled'))
    .filter((entry) => entry.role !== 'end')
    .map((entry) => entry.item);
  const seen = new Set(dated.map((item) => item.id));
  const rest = items
    .filter((item) => !seen.has(item.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  return [...dated, ...rest];
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  held: { gap: spacing.xs, opacity: 0.55 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
