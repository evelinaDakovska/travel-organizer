import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Trip } from '../../../src/domain/trip';
import type { TripItem } from '../../../src/domain/tripItem';
import { useLiveQuery } from '../../../src/hooks/useLiveQuery';
import {
  getTripItem,
  scheduleTripItem,
  TRIP_ITEM_TABLES,
} from '../../../src/repositories/tripItems';
import { getTrip, TRIP_TABLES } from '../../../src/repositories/trips';
import { Button } from '../../../src/ui/components/Button';
import { Field } from '../../../src/ui/components/Field';
import { MomentField, type MomentValue } from '../../../src/ui/components/MomentField';
import { Screen } from '../../../src/ui/components/Screen';
import { ScreenHeader } from '../../../src/ui/components/ScreenHeader';
import { spacing, type, useColors } from '../../../src/ui/tokens';
import { askForRemindersIfDue } from '../../../src/notifications/reminders';

/** Moving an idea onto the timeline: give it a day, and it becomes confirmed. */
export default function ScheduleItem() {
  const c = useColors();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const { data: item, loading } = useLiveQuery(
    useCallback((database) => getTripItem(database, itemId), [itemId]),
    TRIP_ITEM_TABLES,
    [itemId],
  );
  const tripId = item?.tripId;
  const { data: trip } = useLiveQuery(
    useCallback(async (database) => (tripId ? getTrip(database, tripId) : null), [tripId]),
    TRIP_TABLES,
    [tripId],
  );

  return (
    <Screen>
      <ScreenHeader title="Move to Timeline" leading="close" />
      {loading || (item && !trip) ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : item && trip ? (
        <ScheduleForm item={item} trip={trip} />
      ) : (
        <View style={styles.centre}>
          <Text style={[type.body, { color: c.textMuted }]}>This item no longer exists.</Text>
        </View>
      )}
    </Screen>
  );
}

function ScheduleForm({ item, trip }: { item: TripItem; trip: Trip }) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [moment, setMoment] = useState<MomentValue | undefined>(
    item.start
      ? { local: item.start.local, ...(item.startTzOverride ? { tz: item.startTzOverride } : {}) }
      : undefined,
  );

  const move = async () => {
    if (!moment) return;
    setBusy(true);
    try {
      await scheduleTripItem(db, item.id, moment, 'confirmed');
      router.back();
      void askForRemindersIfDue(db, item.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[type.body, { color: c.textMuted }]}>
        “{item.title}” leaves Places and goes onto the timeline as confirmed. Its notes and
        attachments come with it.
      </Text>

      <Field label="When" hint="A day is enough. Add a time if you know it">
        <MomentField value={moment} onChange={setMoment} defaultTz={trip.defaultTz} />
      </Field>

      <Button label="Move to Timeline" disabled={!moment} busy={busy} onPress={() => void move()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
