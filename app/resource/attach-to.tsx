import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { itemsInTimelineOrder } from '../../src/domain/timeline';
import type { TripItem } from '../../src/domain/tripItem';
import { queryView } from '../../src/hooks/queryView';
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
import { Rows } from '../../src/ui/components/ListRow';
import { LoadFailed } from '../../src/ui/components/QueryStates';
import { Screen } from '../../src/ui/components/Screen';
import { ScreenHeader } from '../../src/ui/components/ScreenHeader';
import { gutter, opacity, spacing, type, useColors } from '../../src/ui/tokens';

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

  const choicesQuery = useLiveQuery(
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

  const data = choicesQuery.data;
  const view = queryView(choicesQuery);
  const ordered = useMemo(() => (data ? itemsInTimelineOrder(data.items) : []), [data]);

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
      {view === 'loading' ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : view === 'failed' ? (
        <View style={styles.centre}>
          <LoadFailed what="this attachment's trip" onRetry={choicesQuery.refetch} />
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
          <Rows>
            {ordered.map((item) =>
              data.holding.has(item.id) ? (
                <View key={item.id} style={styles.held}>
                  <ItemRow item={item} />
                  <Text style={[type.caption, { color: c.textMuted }]}>Already attached here</Text>
                </View>
              ) : (
                <ItemRow key={item.id} item={item} onPress={() => void attach(item)} />
              ),
            )}
          </Rows>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter.normal,
    paddingTop: spacing.sm,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  held: { paddingBottom: spacing.sm, opacity: opacity.dimmed },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
